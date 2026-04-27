import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('data:brands');
	const { supabase, organization, allMemberships } = locals;

	const brandOrgIds = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);

	// Sales reps cannot access brands page — except Nx-BLSR, who use /brands
	// as their multi-brand-org switcher.
	if (locals.membership?.role === 'sales' && !nxBlsr) {
		throw redirect(303, '/insight');
	}

	// Buyer: show only brands they have access to
	if (locals.isBuyer) {
		const buyerBrandIds = locals.buyerBrandIds ?? [];
		if (buyerBrandIds.length === 0) return { brands: [], brandTotals: {} };

		const { data: brands } = await supabase
			.from('brands')
			.select('*')
			.in('id', buyerBrandIds)
			.eq('is_active', true)
			.order('name');

		return { brands: brands ?? [], brandTotals: {} };
	}

	if (!organization) return { brands: [], brandTotals: {} };

	const currentYear = new Date().getFullYear();

	// RLS handles visibility: own-org brands + connected brands via federation policy.
	// No org_id filter — MBISR users see their own brands AND connected BOA brands.
	// Nx-BLSR: own-org set is the union of every brand-org they're a sales-role
	// member of, so YTD totals + connection lookups span all of those.
	// Connection rates: connected brands store their commission on org_connections.commission_rate
	// (org-level, per brand_org). Merge that onto each brand row so the UI has a single source.
	const ownOrgIds = nxBlsr ? brandOrgIds : [organization.id];
	const [brandsRes, ordersRes, connsRes] = await Promise.all([
		supabase.from('brands').select('*').eq('is_active', true).order('name'),
		supabase
			.from('orders')
			.select('brand_id, total_amount')
			.in('organization_id', ownOrgIds)
			.eq('order_year', currentYear),
		supabase
			.from('org_connections')
			.select('brand_org_id, commission_rate')
			.in('rep_org_id', ownOrgIds)
			.eq('status', 'active')
	]);

	const connectionRateByBrandOrg = new Map<string, number>();
	for (const c of connsRes.data ?? []) {
		if (c.brand_org_id && c.commission_rate != null) {
			connectionRateByBrandOrg.set(c.brand_org_id, Number(c.commission_rate));
		}
	}

	const ownOrgIdSet = new Set(ownOrgIds);
	const brands = (brandsRes.data ?? []).map((brand) => ({
		...brand,
		resolved_commission_rate: ownOrgIdSet.has(brand.organization_id)
			? (brand.commission_rate ?? 0)
			: (connectionRateByBrandOrg.get(brand.organization_id) ?? 0)
	}));

	const totals: Record<string, number> = {};
	for (const order of ordersRes.data ?? []) {
		totals[order.brand_id] = (totals[order.brand_id] ?? 0) + Number(order.total_amount);
	}

	return {
		brands,
		brandTotals: totals,
		organizationId: organization.id,
		// Nx-BLSR: their brand-org IDs union — used by the page to suppress the
		// "Connected" badge on brands they directly belong to (these aren't
		// federated connections, they're direct memberships).
		userBrandOrgIds: nxBlsr ? brandOrgIds : null
	};
};
