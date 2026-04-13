import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

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

	const [brandsRes, ordersRes] = await Promise.all([
		supabase.from('brands').select('*').eq('organization_id', organization.id).order('name'),
		supabase
			.from('orders')
			.select('brand_id, total_amount')
			.eq('organization_id', organization.id)
			.eq('order_year', currentYear)
	]);

	const totals: Record<string, number> = {};
	for (const order of ordersRes.data ?? []) {
		totals[order.brand_id] = (totals[order.brand_id] ?? 0) + Number(order.total_amount);
	}

	return {
		brands: brandsRes.data ?? [],
		brandTotals: totals
	};
};
