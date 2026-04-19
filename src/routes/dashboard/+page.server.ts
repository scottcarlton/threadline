import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('data:dashboard');
	const { supabase } = locals;

	// Dashboard is buyer-only — redirect non-buyers to /insight
	if (!locals.isBuyer) {
		redirect(303, '/insight');
	}

	const accountIds = locals.buyerAccounts?.map((a) => a.account_id) ?? [];
	const buyerBrandIds = locals.buyerBrandIds ?? [];

	const [recentOrdersRes, brandCountRes, totalOrdersRes, activeOrdersRes] = await Promise.all([
		supabase
			.from('orders')
			.select('*, brands(name), accounts(business_name)')
			.in('account_id', accountIds)
			.order('created_at', { ascending: false })
			.limit(5),
		supabase
			.from('brands')
			.select('id, name, logo_url')
			.in('id', buyerBrandIds.length > 0 ? buyerBrandIds : ['__none__'])
			.eq('is_active', true),
		supabase
			.from('orders')
			.select('*', { count: 'exact', head: true })
			.in('account_id', accountIds),
		supabase
			.from('orders')
			.select('*', { count: 'exact', head: true })
			.in('account_id', accountIds)
			.in('status', ['draft', 'submitted', 'confirmed'])
	]);

	return {
		metrics: {
			revenue: 0,
			orderCount: totalOrdersRes.count ?? 0,
			openOrders: activeOrdersRes.count ?? 0,
			brandCount: brandCountRes.data?.length ?? 0,
			accountCount: 0
		},
		buyerData: {
			recentOrders: recentOrdersRes.data ?? [],
			brands: brandCountRes.data ?? []
		}
	};
};
