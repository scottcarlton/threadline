import { fail, redirect } from '@sveltejs/kit';
import {
	groupCart,
	buildOrders,
	validateCart,
	CartValidationError,
	type CartLine
} from '$lib/server/orders/cart.js';
import { sendOrderEmail } from '$lib/server/order-emails.js';
import { createNotification, notifyBrandAdmins } from '$lib/server/notifications.js';
import { detectDrift, driftReason } from '$lib/server/orders/drift.js';
import { emitOrderEvent } from '$lib/server/integrations/events.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { isPaymentPreferenceCode } from '$lib/payment-methods';
import type { FinalizeInput } from '$lib/schemas/order-finalize';
import { submitPayloadSchema } from '$lib/schemas/order-submit';
import { resolveOrderSettings } from '$lib/server/orders/resolve-order-settings.js';
import { resolveOrderScope } from '$lib/server/orders/order-scope.js';
import { authorizeSubmitPayload } from '$lib/server/orders/authorize-submit.js';
import { submissionIds } from '$lib/server/orders/order-ids.js';

export type SubmitOutcome =
	| {
			ok: true;
			/** One per brand/season group, in cart order. `inserted` is false on a replay. */
			orders: Array<{ id: string; order_number: string; inserted: boolean }>;
			/** Set when a captured order was saved as a draft because of drift. */
			drift?: { reason: string };
	  }
	| { ok: false; status: 400 | 401 | 403 | 409 | 500; message: string };

/**
 * The `?/submit` form action on the order wizards: reads the JSON payload from
 * the form and turns the outcome into a redirect or a `fail`.
 */
export async function submitOrder(
	request: Request,
	locals: App.Locals
): Promise<ReturnType<typeof fail> | never> {
	const formData = await request.formData();
	const raw = formData.get('payload');
	if (typeof raw !== 'string') return fail(400, { message: 'Missing payload' });

	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return fail(400, { message: 'Invalid payload JSON' });
	}

	const outcome = await submitOrderPayload(json, locals, request.headers.get('origin') ?? '');
	if (!outcome.ok) return fail(outcome.status, { message: outcome.message });
	if (outcome.orders.length === 0) throw redirect(303, '/orders');
	const numbers = outcome.orders
		.slice(0, 10)
		.map((o) => o.order_number)
		.join(',');
	throw redirect(303, `/orders/confirmation?ids=${numbers}`);
}

/**
 * Validate, authorize and write one order submission (SCO-208). Shared by the
 * form action above and POST /api/sync/orders, so an order synced from the
 * offline outbox is checked exactly like one submitted online, at sync time.
 * `origin` is used for links in emails and integration events.
 */
export async function submitOrderPayload(
	json: unknown,
	locals: App.Locals,
	origin: string,
	opts: {
		/**
		 * The order was captured earlier on a device (the offline outbox). Prices
		 * or terms that changed since then save it as a draft for the rep to
		 * review, instead of submitting on numbers they never saw (SCO-209).
		 */
		captured?: boolean;
	} = {}
): Promise<SubmitOutcome> {
	const { organization, user } = locals;
	const role = locals.membership?.role;

	if (!organization || !user) return { ok: false, status: 401, message: 'Not authenticated' };

	if (!locals.isBuyer && !['admin', 'owner', 'member', 'sales'].includes(role ?? '')) {
		console.error('[submit-order] role rejected', { role, org_id: organization.id });
		return { ok: false, status: 403, message: 'You do not have permission to submit orders.' };
	}

	const supabase = supabaseAdmin;

	const parsed = submitPayloadSchema.safeParse(json);
	if (!parsed.success) {
		const first = parsed.error.issues[0];
		return { ok: false, status: 400, message: first?.message ?? 'Order payload failed validation' };
	}
	const payload = parsed.data;
	const finalizeData: FinalizeInput | null = payload.finalize ?? null;

	// Everything below writes through supabaseAdmin, so authorize every
	// referenced ID against the picker scope before the first write.
	const scope = await resolveOrderScope(locals, organization.id);
	let auth;
	try {
		auth = await authorizeSubmitPayload(supabase, payload, scope, {
			userId: user.id,
			orgId: organization.id,
			staleTerms: opts.captured ? 'collect' : 'deny'
		});
	} catch (err) {
		console.error('[submit-order] authorization lookup failed', {
			org_id: organization.id,
			error: err
		});
		return { ok: false, status: 500, message: 'Could not verify the order. Try again.' };
	}
	if (!auth.ok) {
		console.warn('[submit-order] payload rejected', {
			org_id: organization.id,
			user_id: user.id,
			status: auth.status,
			message: auth.message
		});
		return { ok: false, status: auth.status, message: auth.message };
	}

	// A captured order whose prices or terms moved on is saved as a draft: it
	// still lands (nothing the rep wrote is lost), but nothing goes to the brand
	// until the rep has looked at it.
	const drift = opts.captured
		? detectDrift(payload.lines, auth.products, auth.staleTermsBrandIds)
		: null;
	if (drift) payload.submitStatus = 'draft';

	// Price, style number and description come from the product row, never the
	// client. The wizard shows wholesale_price today, so this matches what the
	// writer saw unless the price changed after the line was added.
	const lines: CartLine[] = payload.lines.map((l) => {
		const prod = auth.products.get(l.product_id)!;
		return {
			product_id: l.product_id,
			brand_id: l.brand_id,
			season_id: l.season_id,
			style_number: prod.style_number,
			description: prod.name,
			color: l.color,
			size: l.size,
			qty: l.qty,
			unit_price: Number(prod.wholesale_price)
		};
	});

	const groups = groupCart(lines);

	for (const g of groups) {
		const meta = payload.groups.find(
			(m) => m.brand_id === g.brand_id && m.season_id === g.season_id
		);
		if (meta) {
			g.delivery = meta.delivery;
			g.location_id = meta.location_id;
		}
	}

	const createsFreeformAccount =
		!payload.account_id && Boolean(payload.freeformDetails?.business_name);

	// Validate before the freeform account insert so a rejected cart leaves no
	// orphan account behind. The inline account counts as an account here.
	try {
		validateCart(
			groups,
			{
				type: payload.type,
				account_id: createsFreeformAccount ? 'pending-freeform-account' : payload.account_id,
				freeform_name: createsFreeformAccount ? null : payload.freeform_name,
				order_year: payload.order_year
			},
			payload.submitStatus
		);
	} catch (e) {
		if (e instanceof CartValidationError) return { ok: false, status: 400, message: e.message };
		throw e;
	}

	const ids = submissionIds(payload.submission_id);

	// The inline account is written in the same transaction as the orders, so a
	// failed submission never leaves an account behind.
	let resolvedAccountId = payload.account_id;
	let resolvedFreeformName = payload.freeform_name;
	let freeformAccountRow: Record<string, string | null> | null = null;
	if (createsFreeformAccount && payload.freeformDetails) {
		const details = payload.freeformDetails;
		freeformAccountRow = {
			id: ids.accountId(),
			organization_id: organization.id,
			business_name: details.business_name,
			contact_first_name: details.contact_first_name || null,
			contact_last_name: details.contact_last_name || null,
			contact_email: details.contact_email || null,
			phone: details.phone || null,
			address_line1: details.address_line1 || null,
			city: details.city || null,
			state: details.state || null,
			zip: details.zip || null
		};
		resolvedAccountId = freeformAccountRow.id;
		resolvedFreeformName = null;
	}

	const newOrders = buildOrders(
		groups,
		{
			type: payload.type,
			account_id: resolvedAccountId,
			freeform_name: resolvedFreeformName,
			order_year: payload.order_year
		},
		payload.submitStatus
	);

	const acceptedMethods = (organization.accepted_payment_methods ?? []) as string[];
	const rawPref = (payload.payment_preference ?? '').toString().trim();
	const legacyPaymentPrefValue =
		rawPref && isPaymentPreferenceCode(rawPref) && acceptedMethods.includes(rawPref)
			? rawPref
			: null;

	const overrideByKey = new Map<string, FinalizeInput['orders'][number]>();
	if (finalizeData) {
		for (const o of finalizeData.orders) {
			const key = `${o.brand_id}::${o.season_id ?? ''}`;
			overrideByKey.set(key, o);
		}
	}
	const overrideFor = (brand_id: string, season_id: string | null) =>
		overrideByKey.get(`${brand_id}::${season_id ?? ''}`) ?? null;

	const agreedByBrand = new Map<string, { terms_id: string | null; agreed: boolean }>();
	if (finalizeData) {
		for (const ba of finalizeData.brand_agreements) {
			agreedByBrand.set(ba.brand_id, { terms_id: ba.terms_id, agreed: ba.agreed });
		}
	}

	let resolvedShowId: string | null = null;
	if (finalizeData?.show_date_id) {
		const { data: sd } = await supabase
			.from('show_dates')
			.select('show_id')
			.eq('id', finalizeData.show_date_id)
			.single();
		resolvedShowId = sd?.show_id ?? null;
	}

	const isBrandOrgWriter = organization.org_type === 'brand';

	const brandCommerce = await resolveOrderSettings(
		supabase,
		Array.from(new Set(newOrders.map((o) => o.brand_id)))
	).catch((err: unknown) => {
		console.error('[submit-order] brand commerce resolve failed', { error: err });
		return null;
	});
	if (brandCommerce === null) {
		return { ok: false, status: 500, message: 'Failed to resolve brand commerce settings' };
	}

	const brandOrgMap = new Map<string, string>();
	if (isBrandOrgWriter) {
		for (const [brandId, settings] of brandCommerce) {
			brandOrgMap.set(brandId, settings.owner_org_id);
		}
	}

	let selectedSourceName: string | null = null;
	if (finalizeData?.source_type_id) {
		const { data: srcRow } = await supabase
			.from('source_types')
			.select('name')
			.eq('id', finalizeData.source_type_id)
			.maybeSingle();
		selectedSourceName = srcRow?.name?.trim() ?? null;
	}
	const sourceByOrgName = new Map<string, string>();
	if (selectedSourceName) {
		const orderOrgIds = Array.from(
			new Set(newOrders.map((o) => brandOrgMap.get(o.brand_id) ?? organization.id))
		);
		if (orderOrgIds.length > 0) {
			const { data: sources } = await supabase
				.from('source_types')
				.select('id, organization_id, name')
				.in('organization_id', orderOrgIds)
				.eq('is_active', true);
			const targetKey = selectedSourceName.toLowerCase();
			for (const s of (sources ?? []) as Array<{
				id: string;
				organization_id: string;
				name: string;
			}>) {
				if (s.name.trim().toLowerCase() === targetKey) {
					sourceByOrgName.set(`${s.organization_id}::${targetKey}`, s.id);
				}
			}
		}
	}

	const now = new Date().toISOString();
	const prepared = newOrders.map((o) => {
		const ov = overrideFor(o.brand_id, o.season_id);

		const brandAccepted = brandCommerce.get(o.brand_id)?.accepted_payment_methods ?? [];
		const fallbackPaymentPref =
			legacyPaymentPrefValue && brandAccepted.includes(legacyPaymentPrefValue)
				? legacyPaymentPrefValue
				: null;
		const paymentPrefValue =
			(ov?.payment_preference && brandAccepted.includes(ov.payment_preference)
				? ov.payment_preference
				: null) ?? fallbackPaymentPref;

		const paymentTermsValue =
			ov?.payment_terms && brandAccepted.includes(ov.payment_terms) ? ov.payment_terms : null;

		const shippingMethodValue = ov?.shipping_method ?? null;
		const poNumberValue = ov?.po_number ?? null;
		const internalNoteValue = ov?.internal_note ?? null;
		const shipToLocationId = ov?.ship_to_location_id ?? o.location_id;
		const billToLocationId = ov?.bill_to_location_id ?? null;

		const ba = agreedByBrand.get(o.brand_id);
		const canStampTerms = Boolean(
			finalizeData &&
			finalizeData.submit_mode === 'order' &&
			(o.status === 'submitted' || o.status === 'confirmed') &&
			ba?.agreed &&
			ba.terms_id
		);

		const orderOrgId = isBrandOrgWriter
			? (brandOrgMap.get(o.brand_id) ?? organization.id)
			: organization.id;

		const row = {
			id: ids.orderId(o.brand_id, o.season_id),
			organization_id: orderOrgId,
			order_type: o.order_type,
			account_id: o.account_id,
			freeform_name: o.freeform_name,
			location_id: shipToLocationId,
			bill_to_location_id: billToLocationId,
			brand_id: o.brand_id,
			season_id: o.season_id,
			order_year: o.order_year,
			delivery_id: o.delivery_id,
			expected_ship_date: o.expected_ship_date,
			start_ship_date: o.start_ship_date,
			status: o.status,
			total_amount: o.total_amount,
			payment_preference: paymentPrefValue,
			payment_terms: paymentTermsValue,
			shipping_method: shippingMethodValue,
			po_number: poNumberValue,
			notes: internalNoteValue,
			rep_user_id: finalizeData?.rep_user_id ?? null,
			channel: finalizeData?.channel ?? (locals.isBuyer ? 'web-buyer' : 'web-rep'),
			source_type_id: selectedSourceName
				? (sourceByOrgName.get(`${orderOrgId}::${selectedSourceName.toLowerCase()}`) ?? null)
				: null,
			show_date_id: finalizeData?.show_date_id ?? null,
			show_id: resolvedShowId,
			terms_id: canStampTerms ? ba!.terms_id : null,
			terms_agreed_by: canStampTerms ? user.id : null,
			terms_agreed_at: canStampTerms ? now : null,
			// created_by is the p_actor argument, not a row field.
			submitted_at: o.status === 'submitted' || o.status === 'confirmed' ? now : null,
			confirmed_at: o.status === 'confirmed' ? now : null,
			lines: o.lines.map((l, i) => ({
				product_id: l.product_id,
				style_number: l.style_number,
				description: l.description,
				color: l.color,
				size: l.size,
				qty: l.qty,
				unit_price: l.unit_price,
				sort_order: i
			}))
		};
		return { o, orderOrgId, row };
	});

	// One transaction for the inline account, every order and every line. Order
	// ids come from the submission id, so a retry returns the stored orders with
	// inserted = false instead of writing them again.
	const { data: written, error: writeErr } = await supabase.rpc('create_order_submission', {
		p_actor: user.id,
		p_account: freeformAccountRow,
		p_orders: prepared.map((p) => p.row)
	});

	if (writeErr || !written) {
		console.error('[submit-order] order submission write failed', {
			org_id: organization.id,
			user_id: user.id,
			role,
			submission_id: ids.submissionId,
			order_count: prepared.length,
			error: writeErr
		});
		// A client id that belongs to another org or user. Retrying would get the
		// same answer, so it is not a server error.
		if (writeErr?.code === '23505') {
			return { ok: false, status: 409, message: 'This order id is already in use.' };
		}
		return { ok: false, status: 500, message: 'Could not save the order. Try again.' };
	}

	const results = new Map(
		(written as Array<{ order_id: string; order_number: string; inserted: boolean }>).map((r) => [
			r.order_id,
			r
		])
	);
	const orders: Array<{ id: string; order_number: string; inserted: boolean }> = [];

	for (const { o, orderOrgId, row } of prepared) {
		const result = results.get(row.id);
		if (!result) continue;
		orders.push({
			id: result.order_id,
			order_number: result.order_number,
			inserted: result.inserted
		});

		// A replay already ran its side effects the first time.
		if (!result.inserted) continue;

		const orderRow = { id: result.order_id, order_number: result.order_number };

		// orderOrgId, not organization.id: a brand-org writer creates the order in
		// the brand's org, and the row must land on that org's timeline.
		locals.audit.record('order.created', {
			organizationId: orderOrgId,
			subjectId: orderRow.id,
			subjectLabel: orderRow.order_number,
			metadata: {
				status: o.status,
				orderType: o.order_type,
				brandId: o.brand_id,
				lineCount: o.lines.length,
				totalAmount: o.total_amount
			}
		});

		if (o.status === 'submitted' || o.status === 'confirmed') {
			// A separate event from order.created: "someone drafted an order" and
			// "an order went to the brand" are different questions.
			locals.audit.record('order.submitted', {
				organizationId: orderOrgId,
				subjectId: orderRow.id,
				subjectLabel: orderRow.order_number,
				metadata: { status: o.status, brandId: o.brand_id, totalAmount: o.total_amount }
			});

			sendOrderEmail(
				o.status,
				{
					id: orderRow.id,
					order_number: orderRow.order_number,
					total_amount: o.total_amount,
					brand_id: o.brand_id,
					account_id: o.account_id,
					created_by: user.id
				},
				origin
			);
			const isConfirmed = o.status === 'confirmed';
			notifyBrandAdmins(o.brand_id, user.id, {
				type: isConfirmed ? 'order_confirmed' : 'order_submitted',
				title: isConfirmed ? 'New order confirmed' : 'New order submitted',
				body: `Order ${orderRow.order_number} has been ${isConfirmed ? 'confirmed' : 'submitted'}`,
				link: `/orders/${orderRow.id}`
			});
			emitOrderEvent(orderOrgId, orderRow.id, isConfirmed ? 'confirmed' : 'submitted', origin);
		}
	}

	if (drift) {
		const reason = driftReason(drift);
		const first = orders.find((o) => o.inserted);
		// Once, on the first write; a replay already told the rep.
		if (first) {
			await createNotification({
				organizationId: organization.id,
				userId: user.id,
				type: 'order_needs_review',
				title: 'Order saved as a draft',
				body: reason,
				link: `/orders/${first.id}`
			}).catch((err: unknown) =>
				console.error('[submit-order] drift notification failed', { error: err })
			);
		}
		return { ok: true, orders, drift: { reason } };
	}
	return { ok: true, orders };
}
