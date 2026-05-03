import { fail, redirect } from '@sveltejs/kit';
import {
	groupCart,
	buildOrders,
	validateCart,
	CartValidationError,
	type CartLine,
	type DeliveryChoice
} from '$lib/server/orders/cart.js';
import type { OrderType, OrderStatus } from '$lib/types/database.js';
import { sendOrderEmail } from '$lib/server/order-emails.js';
import { notifyBrandAdmins } from '$lib/server/notifications.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { isPaymentPreferenceCode } from '$lib/payment-methods';
import { finalizeSchema, type FinalizeInput } from '$lib/schemas/order-finalize';
import { resolveOrderSettings } from '$lib/server/orders/resolve-order-settings.js';

type FreeformDetails = {
	business_name: string;
	contact_first_name: string;
	contact_last_name: string;
	contact_email: string;
	phone: string;
	address_line1: string;
	city: string;
	state: string;
	zip: string;
};

export type SubmitPayload = {
	type: OrderType;
	account_id: string | null;
	freeform_name: string | null;
	freeformDetails?: FreeformDetails;
	order_year: number | null;
	submitStatus: OrderStatus;
	payment_preference: string | null;
	lines: CartLine[];
	groups: Array<{
		brand_id: string;
		season_id: string | null;
		delivery: DeliveryChoice | null;
		location_id: string | null;
	}>;
	finalize?: FinalizeInput | null;
};

export async function submitOrder(
	request: Request,
	locals: App.Locals
): Promise<ReturnType<typeof fail> | never> {
	const { organization, user } = locals;
	const role = locals.membership?.role;

	if (!organization || !user) return fail(401, { message: 'Not authenticated' });

	if (!locals.isBuyer && !['admin', 'owner', 'member', 'sales'].includes(role ?? '')) {
		console.error('[submit-order] role rejected', { role, org_id: organization.id });
		return fail(403, { message: 'You do not have permission to submit orders.' });
	}

	const supabase = supabaseAdmin;

	const formData = await request.formData();
	const raw = formData.get('payload');
	if (typeof raw !== 'string') return fail(400, { message: 'Missing payload' });

	let payload: SubmitPayload;
	try {
		payload = JSON.parse(raw);
	} catch {
		return fail(400, { message: 'Invalid payload JSON' });
	}

	const groups = groupCart(payload.lines);

	for (const g of groups) {
		const meta = payload.groups.find(
			(m) => m.brand_id === g.brand_id && m.season_id === g.season_id
		);
		if (meta) {
			g.delivery = meta.delivery;
			g.location_id = meta.location_id;
		}
	}

	let resolvedAccountId = payload.account_id;
	let resolvedFreeformName = payload.freeform_name;
	if (!resolvedAccountId && payload.freeformDetails?.business_name?.trim()) {
		const details = payload.freeformDetails;
		const { data: newAccount, error: acctErr } = await supabase
			.from('accounts')
			.insert({
				organization_id: organization.id,
				business_name: details.business_name.trim(),
				contact_first_name: details.contact_first_name?.trim() || null,
				contact_last_name: details.contact_last_name?.trim() || null,
				contact_email: details.contact_email?.trim() || null,
				phone: details.phone?.trim() || null,
				address_line1: details.address_line1?.trim() || null,
				city: details.city?.trim() || null,
				state: details.state?.trim() || null,
				zip: details.zip?.trim() || null
			})
			.select('id')
			.single();
		if (acctErr || !newAccount) {
			console.error('[submit-order] freeform account insert failed', {
				org_id: organization.id,
				user_id: user.id,
				role,
				error: acctErr
			});
			return fail(500, { message: acctErr?.message ?? 'Failed to create account' });
		}
		resolvedAccountId = newAccount.id;
		resolvedFreeformName = null;
	}

	try {
		validateCart(
			groups,
			{
				type: payload.type,
				account_id: resolvedAccountId,
				freeform_name: resolvedFreeformName,
				order_year: payload.order_year
			},
			payload.submitStatus
		);
	} catch (e) {
		if (e instanceof CartValidationError) return fail(400, { message: e.message });
		throw e;
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

	const createdIds: string[] = [];
	const createdNumbers: string[] = [];

	const acceptedMethods = (organization.accepted_payment_methods ?? []) as string[];
	const rawPref = (payload.payment_preference ?? '').toString().trim();
	const legacyPaymentPrefValue =
		rawPref && isPaymentPreferenceCode(rawPref) && acceptedMethods.includes(rawPref)
			? rawPref
			: null;

	let finalizeData: FinalizeInput | null = null;
	if (payload.finalize) {
		const parsed = finalizeSchema.safeParse(payload.finalize);
		if (!parsed.success) {
			const first = parsed.error.issues[0];
			return fail(400, {
				message: first?.message ?? 'Finalize payload failed validation'
			});
		}
		finalizeData = parsed.data;
	}

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
		return fail(500, { message: 'Failed to resolve brand commerce settings' });
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

	for (const o of newOrders) {
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

		const { data: orderRow, error: orderErr } = await supabase
			.from('orders')
			.insert({
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
				source_type_id: selectedSourceName
					? (sourceByOrgName.get(`${orderOrgId}::${selectedSourceName.toLowerCase()}`) ?? null)
					: null,
				show_date_id: finalizeData?.show_date_id ?? null,
				show_id: resolvedShowId,
				terms_id: canStampTerms ? ba!.terms_id : null,
				terms_agreed_by: canStampTerms ? user.id : null,
				terms_agreed_at: canStampTerms ? new Date().toISOString() : null,
				created_by: user.id,
				submitted_at:
					o.status === 'submitted' || o.status === 'confirmed' ? new Date().toISOString() : null,
				confirmed_at: o.status === 'confirmed' ? new Date().toISOString() : null
			})
			.select('id, order_number')
			.single();

		if (orderErr || !orderRow) {
			console.error('[submit-order] order insert failed', {
				org_id: organization.id,
				user_id: user.id,
				role,
				brand_id: o.brand_id,
				account_id: o.account_id,
				error: orderErr
			});
			return fail(500, { message: orderErr?.message ?? 'Failed to create order' });
		}

		if (o.lines.length > 0) {
			const linesInsert = o.lines.map((l, i) => ({
				order_id: orderRow.id,
				product_id: l.product_id,
				style_number: l.style_number,
				description: l.description,
				color: l.color,
				size: l.size,
				qty: l.qty,
				unit_price: l.unit_price,
				sort_order: i
			}));
			const { error: lineErr } = await supabase.rpc('insert_order_lines_with_actor', {
				actor: user.id,
				lines: linesInsert
			});
			if (lineErr) {
				console.error('[submit-order] order_lines insert failed', {
					order_id: orderRow.id,
					line_count: linesInsert.length,
					error: lineErr
				});
				return fail(500, { message: lineErr.message });
			}
		}

		if (o.status === 'submitted' || o.status === 'confirmed') {
			const origin = request.headers.get('origin') ?? '';
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
		}

		createdIds.push(orderRow.id);
		createdNumbers.push(orderRow.order_number);
	}

	if (createdNumbers.length === 0) {
		throw redirect(303, '/orders');
	}

	const ids = createdNumbers.slice(0, 10).join(',');
	throw redirect(303, `/orders/confirmation?ids=${ids}`);
}
