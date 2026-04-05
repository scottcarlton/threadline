import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	if (!organization) {
		return { stats: null };
	}

	// Basic stats for the dashboard
	const [ordersResult, brandsResult, accountsResult] = await Promise.all([
		supabase
			.from('orders')
			.select('id, status, total_amount', { count: 'exact' })
			.eq('organization_id', organization.id),
		supabase
			.from('brands')
			.select('id', { count: 'exact' })
			.eq('organization_id', organization.id)
			.eq('is_active', true),
		supabase
			.from('accounts')
			.select('id', { count: 'exact' })
			.eq('organization_id', organization.id)
			.eq('is_active', true)
	]);

	const orders = ordersResult.data ?? [];
	const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

	return {
		stats: {
			orderCount: ordersResult.count ?? 0,
			brandCount: brandsResult.count ?? 0,
			accountCount: accountsResult.count ?? 0,
			totalRevenue
		}
	};
};
