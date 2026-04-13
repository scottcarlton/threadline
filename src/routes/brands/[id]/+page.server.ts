import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, '/shop');
	const { supabase } = locals;

	const [brandResult, assetsResult, productCountResult, expenseSummaryResult] = await Promise.all([
		supabase.from('brands').select('*').eq('id', params.id).single(),
		supabase
			.from('brand_assets')
			.select('*')
			.eq('brand_id', params.id)
			.order('created_at', { ascending: false }),
		supabase
			.from('products')
			.select('id', { count: 'exact', head: true })
			.eq('brand_id', params.id)
			.is('archived_at', null),
		supabase.from('brand_expenses').select('status, amount').eq('brand_id', params.id)
	]);

	if (brandResult.error || !brandResult.data) {
		throw error(404, 'Brand not found');
	}

	// Performance metrics: orders for this brand
	const currentYear = new Date().getFullYear();
	const { data: brandOrders } = await supabase
		.from('orders')
		.select('id, account_id, total_amount, shipped_amount, status, order_year, created_at')
		.eq('brand_id', params.id)
		.neq('status', 'cancelled');

	const allOrders = brandOrders ?? [];
	const ytdOrders = allOrders.filter((o) => o.order_year === currentYear);
	const prevYearOrders = allOrders.filter((o) => o.order_year === currentYear - 1);

	const ytdRevenue = ytdOrders.reduce((s, o) => s + Number(o.total_amount), 0);
	const prevRevenue = prevYearOrders.reduce((s, o) => s + Number(o.total_amount), 0);
	const ytdShipped = ytdOrders.reduce((s, o) => s + Number(o.shipped_amount ?? 0), 0);
	const uniqueAccounts = new Set(ytdOrders.map((o) => o.account_id)).size;
	const avgOrderValue = ytdOrders.length > 0 ? ytdRevenue / ytdOrders.length : 0;
	const yoyGrowth = prevRevenue > 0 ? ((ytdRevenue - prevRevenue) / prevRevenue) * 100 : 0;

	// Top accounts by revenue
	const accountTotals: Record<string, number> = {};
	for (const o of ytdOrders) {
		accountTotals[o.account_id] = (accountTotals[o.account_id] ?? 0) + Number(o.total_amount);
	}
	const topAccountIds = Object.entries(accountTotals)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([id]) => id);

	let topAccounts: { id: string; name: string; total: number }[] = [];
	if (topAccountIds.length > 0) {
		const { data: accts } = await supabase
			.from('accounts')
			.select('id, business_name')
			.in('id', topAccountIds);
		topAccounts = topAccountIds.map((id) => ({
			id,
			name: (accts ?? []).find((a) => a.id === id)?.business_name ?? 'Unknown',
			total: accountTotals[id]
		}));
	}

	const performance = {
		ytdRevenue,
		ytdShipped,
		ytdOrders: ytdOrders.length,
		totalOrders: allOrders.length,
		uniqueAccounts,
		avgOrderValue,
		yoyGrowth,
		topAccounts
	};

	const allExpenses = expenseSummaryResult.data ?? [];
	const pendingExpenses = allExpenses.filter((e) => e.status === 'submitted');
	const expenseSummary = {
		total: allExpenses.length,
		pendingCount: pendingExpenses.length,
		pendingAmount: pendingExpenses.reduce((s, e) => s + Number(e.amount), 0)
	};

	return {
		brand: brandResult.data,
		brandAssets: assetsResult.data ?? [],
		productCount: productCountResult.count ?? 0,
		expenseSummary,
		performance
	};
};
