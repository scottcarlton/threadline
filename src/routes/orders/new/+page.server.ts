import type { PageServerLoad, Actions } from './$types';
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

export const load: PageServerLoad = async ({ locals }) => {
	const { organization, user } = locals;

	if (!organization) {
		return {
			accounts: [],
			locations: [],
			brands: [],
			seasons: [],
			deliveries: [],
			reps: [],
			sourceTypes: [] as Array<{ id: string; name: string; sort_order: number | null }>,
			brandTerms: [] as Array<{
				id: string;
				brand_id: string;
				title: string;
				body: string;
				version: number;
			}>,
			currentUser: null,
			isBuyer: locals.isBuyer ?? false,
			isBrandOrg: false,
			selfBrandId: null as string | null,
			acceptedPaymentMethods: [] as string[],
			defaultPaymentMethod: null as string | null,
			defaultPaymentTerms: null as string | null,
			defaultShippingMethod: null as string | null
		};
	}

	const isBuyer = locals.isBuyer ?? false;
	const buyerAccountIds = isBuyer ? (locals.buyerAccounts?.map((a) => a.account_id) ?? []) : null;
	const buyerBrandIds = isBuyer ? (locals.buyerBrandIds ?? []) : null;

	// Federation-aware org set: own org + active connections (both directions).
	// Classify the other side of each connection so the rep picker can apply
	// the right role filter (connected brand org → sales only (BLSR);
	// connected rep org → admin or sales).
	const { data: conns } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${organization.id},brand_org_id.eq.${organization.id}`);
	const visibleOrgIdSet = new Set<string>([organization.id]);
	const connectedBrandOrgIds = new Set<string>();
	const connectedRepOrgIds = new Set<string>();
	for (const c of conns ?? []) {
		if (c.rep_org_id && c.rep_org_id !== organization.id) visibleOrgIdSet.add(c.rep_org_id);
		if (c.brand_org_id && c.brand_org_id !== organization.id) visibleOrgIdSet.add(c.brand_org_id);
		if (c.rep_org_id === organization.id && c.brand_org_id) {
			connectedBrandOrgIds.add(c.brand_org_id);
		}
		if (c.brand_org_id === organization.id && c.rep_org_id) {
			connectedRepOrgIds.add(c.rep_org_id);
		}
	}
	const visibleOrgIds = Array.from(visibleOrgIdSet);

	// Rep-picker visibility is broader than the rest of this page: other rep
	// orgs that share a brand partner with us should surface as assignable
	// sales reps on an order, even though those rep orgs aren't directly
	// connected to ours. Accounts / seasons / locations stay scoped to
	// visibleOrgIds (own + direct connections).
	const repVisibleOrgIdSet = new Set(visibleOrgIdSet);
	if (connectedBrandOrgIds.size > 0) {
		const { data: siblingConns } = await supabaseAdmin
			.from('org_connections')
			.select('rep_org_id, brand_org_id')
			.eq('status', 'active')
			.in('brand_org_id', Array.from(connectedBrandOrgIds))
			.neq('rep_org_id', organization.id);
		for (const sc of siblingConns ?? []) {
			if (sc.rep_org_id) {
				repVisibleOrgIdSet.add(sc.rep_org_id);
				connectedRepOrgIds.add(sc.rep_org_id);
			}
		}
	}
	const repVisibleOrgIds = Array.from(repVisibleOrgIdSet);

	const [
		accountsRes,
		locationsRes,
		brandsRes,
		seasonsRes,
		deliveriesRes,
		membersRes,
		sourceTypesRes,
		brandTermsRes
	] = await Promise.all([
		(() => {
			let q = supabaseAdmin
				.from('accounts')
				.select(
					'id, business_name, contact_email, address_line1, address_line2, city, state, zip, payment_preference, payment_terms, shipping_method'
				);
			if (buyerAccountIds) q = q.in('id', buyerAccountIds.length ? buyerAccountIds : ['__none__']);
			else q = q.in('organization_id', visibleOrgIds).eq('is_active', true).is('archived_at', null);
			return q.order('business_name');
		})(),
		supabaseAdmin
			.from('account_locations')
			.select(
				'id, account_id, label, contact_first_name, contact_last_name, contact_email, phone, address_line1, address_line2, city, state, zip, is_default, sort_order'
			)
			.in('organization_id', visibleOrgIds)
			.order('sort_order'),
		(() => {
			let q = supabaseAdmin.from('brands').select('id, name, is_self_brand').eq('is_active', true);
			if (buyerBrandIds) q = q.in('id', buyerBrandIds.length ? buyerBrandIds : ['__none__']);
			else q = q.in('organization_id', visibleOrgIds);
			return q.order('name');
		})(),
		supabaseAdmin
			.from('seasons')
			.select('id, name, sort_order')
			.in('organization_id', visibleOrgIds)
			.eq('is_active', true)
			.order('sort_order'),
		supabaseAdmin
			.from('season_deliveries')
			.select('id, season_id, label, delivery_month, delivery_day, sort_order')
			.order('delivery_month')
			.order('delivery_day'),
		supabaseAdmin
			.from('organization_members')
			.select(
				'profile_id, role, organization_id, profiles!organization_members_profile_id_fkey(display_name)'
			)
			.in('organization_id', repVisibleOrgIds),
		supabaseAdmin
			.from('source_types')
			.select('id, name, sort_order')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('sort_order'),
		supabaseAdmin
			.from('brand_terms')
			.select('id, brand_id, title, body, version')
			.in('organization_id', visibleOrgIds)
			.eq('is_current', true)
	]);

	type RawMember = {
		profile_id: string;
		role: string;
		organization_id: string;
		profiles: { display_name: string | null } | null;
	};
	const rawMembers = (membersRes.data ?? []) as unknown as RawMember[];
	// Own org: all roles (anyone on the team can be the rep on an order).
	// Connected brand org: sales only (BLSR — brand-level sales reps).
	// Connected rep org (direct OR a rep org that shares a brand partner with
	// us — see repVisibleOrgIds above): admin or sales.
	// Dedupe by profile_id so a user who's a member of multiple visible orgs shows once.
	const seenProfileIds = new Set<string>();
	const reps = rawMembers
		.filter((m) => {
			if (m.organization_id === organization.id) return true;
			if (connectedBrandOrgIds.has(m.organization_id)) return m.role === 'sales';
			if (connectedRepOrgIds.has(m.organization_id))
				return m.role === 'admin' || m.role === 'sales';
			return false;
		})
		.filter((m) => {
			if (seenProfileIds.has(m.profile_id)) return false;
			seenProfileIds.add(m.profile_id);
			return true;
		})
		.map((m) => ({
			user_id: m.profile_id,
			name: m.profiles?.display_name ?? 'Unknown'
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

	const brands = brandsRes.data ?? [];
	const isBrandOrg = locals.orgType === 'brand';

	const selfBrandId = isBrandOrg
		? (brands.find((b) => (b as { is_self_brand?: boolean }).is_self_brand)?.id ?? null)
		: null;

	const orgRow = organization as typeof organization & {
		default_payment_terms?: string | null;
		default_shipping_method?: string | null;
	};

	return {
		accounts: accountsRes.data ?? [],
		locations: locationsRes.data ?? [],
		brands,
		seasons: seasonsRes.data ?? [],
		deliveries: deliveriesRes.data ?? [],
		reps,
		sourceTypes: sourceTypesRes.data ?? [],
		brandTerms: brandTermsRes.data ?? [],
		currentUser: user ? { id: user.id } : null,
		isBuyer,
		isBrandOrg,
		selfBrandId,
		acceptedPaymentMethods: (organization.accepted_payment_methods ?? []) as string[],
		defaultPaymentMethod: (organization.default_payment_method ?? null) as string | null,
		defaultPaymentTerms: (orgRow.default_payment_terms ?? null) as string | null,
		defaultShippingMethod: (orgRow.default_shipping_method ?? null) as string | null
	};
};

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

type SubmitPayload = {
	type: OrderType;
	account_id: string | null;
	freeform_name: string | null;
	freeformDetails?: FreeformDetails;
	order_year: number | null;
	submitStatus: OrderStatus; // 'draft' | 'submitted'
	payment_preference: string | null;
	lines: CartLine[];
	groups: Array<{
		brand_id: string;
		season_id: string | null;
		delivery: DeliveryChoice | null;
		location_id: string | null;
	}>;
	// Finalize-step payload. Present when the client has collected per-order
	// overrides + shared rep/source + brand agreements. Absent on older client
	// code paths (back-compat).
	finalize?: FinalizeInput | null;
};

export const actions: Actions = {
	submit: async ({ request, locals }) => {
		const { organization, user } = locals;
		const role = locals.membership?.role;

		if (!organization || !user) return fail(401, { message: 'Not authenticated' });

		// App-layer role gate (buyers allowed; org members need a write role).
		if (!locals.isBuyer && !['admin', 'owner', 'member', 'sales'].includes(role ?? '')) {
			console.error('[orders/new submit] role rejected', { role, org_id: organization.id });
			return fail(403, { message: 'You do not have permission to submit orders.' });
		}

		// Writes use admin client (authenticated SSR client can't reliably attach session to RLS).
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

		// Re-group server-side from the submitted lines (don't trust the client's group breakdown
		// for membership; only trust group-level metadata).
		const groups = groupCart(payload.lines);

		// Apply group metadata (delivery + location) by (brand_id, season_id) key.
		for (const g of groups) {
			const meta = payload.groups.find(
				(m) => m.brand_id === g.brand_id && m.season_id === g.season_id
			);
			if (meta) {
				g.delivery = meta.delivery;
				g.location_id = meta.location_id;
			}
		}

		// If freeform details were provided, create the account first so the
		// orders can be linked and submitted (not stuck as drafts).
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
				console.error('[orders/new submit] freeform account insert failed', {
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

		// Validate + apply the finalize payload if present. The schema enforces
		// the terms-agreed gate for submit_mode === 'order' and rejects
		// freeform + submit. Any failure bails out before any INSERTs.
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

		// Build a per-group override lookup keyed by (brand_id, season_id).
		const overrideByKey = new Map<string, FinalizeInput['orders'][number]>();
		if (finalizeData) {
			for (const o of finalizeData.orders) {
				const key = `${o.brand_id}::${o.season_id ?? ''}`;
				overrideByKey.set(key, o);
			}
		}
		const overrideFor = (brand_id: string, season_id: string | null) =>
			overrideByKey.get(`${brand_id}::${season_id ?? ''}`) ?? null;

		// Pre-index current brand_terms for the brands in the cart so we can
		// stamp terms_id on each submitted (non-note) order. Only brands where
		// the user agreed are eligible.
		const agreedByBrand = new Map<string, { terms_id: string | null; agreed: boolean }>();
		if (finalizeData) {
			for (const ba of finalizeData.brand_agreements) {
				agreedByBrand.set(ba.brand_id, { terms_id: ba.terms_id, agreed: ba.agreed });
			}
		}

		for (const o of newOrders) {
			const ov = overrideFor(o.brand_id, o.season_id);

			// Per-order override → cart-wide legacy payment_preference → null
			const paymentPrefValue =
				(ov?.payment_preference && acceptedMethods.includes(ov.payment_preference)
					? ov.payment_preference
					: null) ?? legacyPaymentPrefValue;

			const paymentTermsValue =
				ov?.payment_terms && acceptedMethods.includes(ov.payment_terms) ? ov.payment_terms : null;

			const shippingMethodValue = ov?.shipping_method ?? null;
			const poNumberValue = ov?.po_number ?? null;
			const internalNoteValue = ov?.internal_note ?? null;
			const shipToLocationId = ov?.ship_to_location_id ?? o.location_id;
			const billToLocationId = ov?.bill_to_location_id ?? null;

			const ba = agreedByBrand.get(o.brand_id);
			const canStampTerms = Boolean(
				finalizeData &&
				finalizeData.submit_mode === 'order' &&
				o.status === 'submitted' &&
				ba?.agreed &&
				ba.terms_id
			);

			const { data: orderRow, error: orderErr } = await supabase
				.from('orders')
				.insert({
					organization_id: organization.id,
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
					source_type_id: finalizeData?.source_type_id ?? null,
					terms_id: canStampTerms ? ba!.terms_id : null,
					terms_agreed_by: canStampTerms ? user.id : null,
					terms_agreed_at: canStampTerms ? new Date().toISOString() : null,
					created_by: user.id,
					submitted_at: o.status === 'submitted' ? new Date().toISOString() : null
				})
				.select('id, order_number')
				.single();

			if (orderErr || !orderRow) {
				console.error('[orders/new submit] order insert failed', {
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
				// Routed through insert_order_lines_with_actor so the line-audit
				// trigger sees the acting user (auth.uid() is null on service-role
				// writes, which would otherwise leave actor_id null → "Unknown").
				const { error: lineErr } = await supabase.rpc('insert_order_lines_with_actor', {
					actor: user.id,
					lines: linesInsert
				});
				if (lineErr) {
					console.error('[orders/new submit] order_lines insert failed', {
						order_id: orderRow.id,
						line_count: linesInsert.length,
						error: lineErr
					});
					return fail(500, { message: lineErr.message });
				}
			}

			if (o.status === 'submitted') {
				const origin = request.headers.get('origin') ?? '';
				sendOrderEmail(
					'submitted',
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
				notifyBrandAdmins(o.brand_id, user.id, {
					type: 'order_submitted',
					title: 'New order submitted',
					body: `Order ${orderRow.order_number} has been submitted`,
					link: `/orders/${orderRow.id}`
				});
			}

			createdIds.push(orderRow.id);
			createdNumbers.push(orderRow.order_number);
		}

		if (createdNumbers.length === 0) {
			// Defensive: Zod validation prevents empty orders[], but fall back
			// to the list view rather than landing on a 404 confirmation.
			throw redirect(303, '/orders');
		}

		const ids = createdNumbers.slice(0, 10).join(',');
		throw redirect(303, `/orders/confirmation?ids=${ids}`);
	}
};
