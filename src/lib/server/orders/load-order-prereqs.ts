import { supabaseAdmin } from '$lib/server/supabase.js';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';
import {
	resolveOrderSettings,
	type BrandCommerceSettings
} from '$lib/server/orders/resolve-order-settings.js';

export async function loadOrderPrereqs(locals: App.Locals) {
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
			defaultShippingMethod: null as string | null,
			brandSettings: {} as Record<string, BrandCommerceSettings>
		};
	}

	const isBuyer = locals.isBuyer ?? false;
	const buyerAccountIds = isBuyer ? (locals.buyerAccounts?.map((a) => a.account_id) ?? []) : null;
	const buyerBrandIds = isBuyer ? (locals.buyerBrandIds ?? []) : null;
	const isBrandOrg = locals.orgType === 'brand';

	const brandOrgIds = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);
	const ownOrgIds = nxBlsr ? brandOrgIds : [organization.id];
	const ownOrgIdSet = new Set(ownOrgIds);

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
			.eq('is_system', false)
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
	const REP_ROLES = new Set(['admin', 'owner', 'sales']);
	const seenProfileIds = new Set<string>();
	const reps = rawMembers
		.filter((m) => {
			if (m.organization_id === organization.id) {
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
}
