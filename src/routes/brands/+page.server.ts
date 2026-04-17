import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	// Sales reps cannot access brands page
	if (locals.membership?.role === 'sales') {
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

	// Own brands + brands from connected brand orgs (federation)
	const [brandsRes, ordersRes, connectionsRes] = await Promise.all([
		supabase.from('brands').select('*').eq('organization_id', organization.id).order('name'),
		supabase
			.from('orders')
			.select('brand_id, total_amount')
			.eq('organization_id', organization.id)
			.eq('order_year', currentYear),
		locals.orgType === 'rep'
			? supabaseAdmin
					.from('org_connections')
					.select('brand_org_id')
					.eq('rep_org_id', organization.id)
					.eq('status', 'active')
			: Promise.resolve({ data: null })
	]);

	// Fetch brands from connected brand orgs
	const connectedOrgIds = (connectionsRes.data ?? []).map(
		(c: { brand_org_id: string }) => c.brand_org_id
	);
	let federatedBrands: typeof brandsRes.data = [];
	if (connectedOrgIds.length > 0) {
		const { data } = await supabaseAdmin
			.from('brands')
			.select('*')
			.in('organization_id', connectedOrgIds)
			.eq('is_active', true)
			.order('name');
		federatedBrands = data ?? [];
	}

	const ownBrands = brandsRes.data ?? [];
	const ownBrandIds = new Set(ownBrands.map((b) => b.id));
	// Merge, deduplicating by ID
	const allBrands = [...ownBrands, ...federatedBrands.filter((b) => !ownBrandIds.has(b.id))];

	const totals: Record<string, number> = {};
	for (const order of ordersRes.data ?? []) {
		totals[order.brand_id] = (totals[order.brand_id] ?? 0) + Number(order.total_amount);
	}

	const federatedBrandIds = new Set((federatedBrands ?? []).map((b) => b.id));

	return {
		brands: allBrands,
		brandTotals: totals,
		federatedBrandIds: Array.from(federatedBrandIds)
	};
};
