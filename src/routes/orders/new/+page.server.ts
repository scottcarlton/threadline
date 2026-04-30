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
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';
import {
	resolveOrderSettings,
	type BrandCommerceSettings
} from '$lib/server/orders/resolve-order-settings.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization, user, allMemberships } = locals;

	if (!organization) {
		return {
			accounts: [],
			locations: [],
			brands: [],
			seasons: [],
			deliveries: [],
			reps: [],
			sourceTypes: [] as Array<{ id: string; name: string; sort_order: number | null }>,
			showDates: [] as Array<{
				id: string;
				show_id: string;
				show_name: string;
				year: number;
				month: number;
				city: string | null;
				state: string | null;
				venue: string | null;
			}>,
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
	const isBrandOrg = locals.orgType === 'brand';

	// Nx-BLSR: own-org set is the union of every brand-org they're a sales-role
	// member of (NOT a federation connection — these are direct memberships).
	// Everyone else: just the active organization id (existing behavior).
	const brandOrgIds = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);
	const ownOrgIds = nxBlsr ? brandOrgIds : [organization.id];
	const ownOrgIdSet = new Set(ownOrgIds);

	// Federation-aware org set: own org(s) + active connections (both directions).
	// Classify the other side of each connection so the rep picker can apply
	// the right role filter (connected brand org → sales only (BLSR);
	// connected rep org → admin or sales).
	const orFilter = ownOrgIds
		.flatMap((id) => [`rep_org_id.eq.${id}`, `brand_org_id.eq.${id}`])
		.join(',');
	const { data: conns } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(orFilter);
	const visibleOrgIdSet = new Set<string>(ownOrgIds);
	const connectedBrandOrgIds = new Set<string>();
	const connectedRepOrgIds = new Set<string>();
	for (const c of conns ?? []) {
		if (c.rep_org_id && !ownOrgIdSet.has(c.rep_org_id)) visibleOrgIdSet.add(c.rep_org_id);
		if (c.brand_org_id && !ownOrgIdSet.has(c.brand_org_id)) visibleOrgIdSet.add(c.brand_org_id);
		if (c.rep_org_id && ownOrgIdSet.has(c.rep_org_id) && c.brand_org_id) {
			connectedBrandOrgIds.add(c.brand_org_id);
		}
		if (c.brand_org_id && ownOrgIdSet.has(c.brand_org_id) && c.rep_org_id) {
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
			.not('rep_org_id', 'in', `(${ownOrgIds.join(',')})`);
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
		showDatesRes,
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
			let q = supabaseAdmin
				.from('brands')
				.select('id, name, logo_url, is_self_brand')
				.eq('is_active', true);
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
			.in('organization_id', ownOrgIds)
			.eq('is_active', true)
			.order('sort_order'),
		supabaseAdmin
			.from('show_dates')
			.select('id, show_id, year, month, city, state, venue, shows!inner(name, is_active)')
			.in('organization_id', ownOrgIds)
			.eq('shows.is_active', true)
			.order('year', { ascending: false })
			.order('month', { ascending: false }),
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
	// Only three user types are valid sales reps on an order:
	//   - BLSR   → role=sales in a connected brand org
	//   - MBISR  → role=admin|owner in a rep org (own OR sibling via shared brand)
	//   - MBLSR  → role=sales in a rep org (own OR sibling via shared brand)
	// member/guest and brand-org admin/owner/member are excluded.
	// Dedupe by profile_id so a user who's a member of multiple visible orgs shows once.
	const REP_ROLES = new Set(['admin', 'owner', 'sales']); // MBISR + MBLSR
	const seenProfileIds = new Set<string>();
	const reps = rawMembers
		.filter((m) => {
			if (m.organization_id === organization.id) {
				// Own org: BLSR (sales only) if we're a brand org;
				// otherwise MBISR+MBLSR (admin/owner/sales).
				return isBrandOrg ? m.role === 'sales' : REP_ROLES.has(m.role);
			}
			if (connectedBrandOrgIds.has(m.organization_id)) return m.role === 'sales';
			if (connectedRepOrgIds.has(m.organization_id)) return REP_ROLES.has(m.role);
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

	const brandsRaw = brandsRes.data ?? [];
	const selfBrandId = isBrandOrg
		? (brandsRaw.find((b) => (b as { is_self_brand?: boolean }).is_self_brand)?.id ?? null)
		: null;

	const brandIds = brandsRaw.map((b) => b.id);
	const productsForCounts = brandIds.length
		? await supabaseAdmin
				.from('products')
				.select('brand_id, season_id')
				.in('brand_id', brandIds)
				.is('archived_at', null)
		: { data: [] as Array<{ brand_id: string; season_id: string | null }> };
	const countsByBrand = new Map<string, { products: number; seasons: Set<string> }>();
	for (const row of (productsForCounts.data ?? []) as Array<{
		brand_id: string;
		season_id: string | null;
	}>) {
		let entry = countsByBrand.get(row.brand_id);
		if (!entry) {
			entry = { products: 0, seasons: new Set<string>() };
			countsByBrand.set(row.brand_id, entry);
		}
		entry.products += 1;
		if (row.season_id) entry.seasons.add(row.season_id);
	}
	const brands = brandsRaw.map((b) => {
		const c = countsByBrand.get(b.id);
		return {
			...b,
			products_count: c?.products ?? 0,
			seasons_count: c?.seasons.size ?? 0
		};
	});

	const orgRow = organization as typeof organization & {
		default_payment_terms?: string | null;
		default_shipping_method?: string | null;
	};

	// Per-brand commerce settings keyed by brand_id. The cart UI is still
	// cart-wide for the picker (acceptedPaymentMethods below comes from the
	// active org), but the server validates per-order against THIS brand's
	// resolved methods at INSERT time. For federated orders the brand may be
	// owned by a different org with different accepted methods than the
	// active one.
	const brandSettingsMap = await resolveOrderSettings(
		supabaseAdmin,
		brands.map((b) => b.id)
	);
	const brandSettings: Record<string, BrandCommerceSettings> = Object.fromEntries(brandSettingsMap);

	return {
		accounts: accountsRes.data ?? [],
		locations: locationsRes.data ?? [],
		brands,
		seasons: seasonsRes.data ?? [],
		deliveries: deliveriesRes.data ?? [],
		reps,
		sourceTypes: sourceTypesRes.data ?? [],
		showDates: (
			(showDatesRes.data ?? []) as Array<{
				id: string;
				show_id: string;
				year: number;
				month: number;
				city: string | null;
				state: string | null;
				venue: string | null;
				shows: { name: string } | { name: string }[] | null;
			}>
		).map((sd) => {
			const show = Array.isArray(sd.shows) ? sd.shows[0] : sd.shows;
			return {
				id: sd.id,
				show_id: sd.show_id,
				show_name: show?.name ?? 'Show',
				year: sd.year,
				month: sd.month,
				city: sd.city,
				state: sd.state,
				venue: sd.venue
			};
		}),
		brandTerms: brandTermsRes.data ?? [],
		currentUser: user ? { id: user.id } : null,
		isBuyer,
		isBrandOrg,
		selfBrandId,
		acceptedPaymentMethods: (organization.accepted_payment_methods ?? []) as string[],
		defaultPaymentMethod: (organization.default_payment_method ?? null) as string | null,
		defaultPaymentTerms: (orgRow.default_payment_terms ?? null) as string | null,
		defaultShippingMethod: (orgRow.default_shipping_method ?? null) as string | null,
		brandSettings
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

		// Resolve show_id from show_date_id (orders store both FKs; read side
		// expects show_dates → shows to be joined, so we persist both).
		let resolvedShowId: string | null = null;
		if (finalizeData?.show_date_id) {
			const { data: sd } = await supabase
				.from('show_dates')
				.select('show_id')
				.eq('id', finalizeData.show_date_id)
				.single();
			resolvedShowId = sd?.show_id ?? null;
		}

		// Resolve each cart brand to its owning organization. For brand-org
		// users (BOA / Nx-BLSR), the order's organization_id MUST match the
		// brand's organization_id — orders RLS gates SELECT on
		// `brand_id IN get_user_brand_ids(organization_id)`, and the BOA list
		// query filters by org_id. For Nx-BLSR (sales-role member of multiple
		// brand-orgs), the active organization context can be a different
		// brand-org than the one owning the brand_id, so always stamp from the
		// brand. Rep-org users still stamp `organization.id` (the rep's own
		// org), preserving the federated-create path from migration
		// 20260417000002.
		const isBrandOrgWriter = organization.org_type === 'brand';

		// Resolve commerce settings for every brand in the cart. Each row gives
		// us both the owning org (for the orders.organization_id stamp on
		// brand-org writers) and the per-brand accepted_payment_methods used to
		// validate payment_preference / payment_terms at INSERT time. For BO
		// brands, settings come from `organizations`; for rep manual brands,
		// from `brands`. See src/lib/server/orders/resolve-order-settings.ts.
		const brandCommerce = await resolveOrderSettings(
			supabase,
			Array.from(new Set(newOrders.map((o) => o.brand_id)))
		).catch((err: unknown) => {
			console.error('[orders/new submit] brand commerce resolve failed', { error: err });
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

		// Nx-BLSR Source resolution. The picker collapses same-named source_types
		// across the user's brand-orgs to one option, so the submitted
		// `source_type_id` is a representative — at insert time we resolve to
		// the source_type owned by THIS order's brand-org. If no match exists in
		// that org, we stamp null (matches today's "no source picked" path).
		// Single-org BOA: name lookup over one org is identity, no behavior change.
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

			// Validate payment preference/terms against THIS brand's accepted
			// methods, not the active org's. For federated orders (rep writes
			// against a connected BO brand) the accepted methods come from the
			// BO; for rep manual brands, from the brand row. Falls back to the
			// cart-wide legacy preference only if both that AND this brand
			// accept it. See resolve-order-settings.ts.
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
				o.status === 'submitted' &&
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
