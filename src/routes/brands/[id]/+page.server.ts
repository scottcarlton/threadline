import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { getConnectedBrandOrgIds } from '$lib/server/federation.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, '/shop');
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const brandId = params.id;

	// Determine if this brand is accessible: own org or federated via active connection
	let brand = (await supabase.from('brands').select('*').eq('id', brandId).single()).data;

	if (!brand && locals.orgType === 'rep') {
		const connectedOrgIds = await getConnectedBrandOrgIds(supabaseAdmin, organization.id);
		if (connectedOrgIds.length > 0) {
			const { data: fedBrand } = await supabaseAdmin
				.from('brands')
				.select('*')
				.eq('id', brandId)
				.in('organization_id', connectedOrgIds)
				.single();
			brand = fedBrand;
		}
	}

	if (!brand) throw error(404, 'Brand not found');

	// For federated brands, use admin client to bypass RLS on cross-org tables
	const isFederated = brand.organization_id !== organization.id;
	const db = isFederated ? supabaseAdmin : supabase;

	const [assetsResult, productCountResult, expenseSummaryResult] = await Promise.all([
		db
			.from('brand_assets')
			.select('*')
			.eq('brand_id', brandId)
			.order('created_at', { ascending: false }),
		db
			.from('products')
			.select('id', { count: 'exact', head: true })
			.eq('brand_id', brandId)
			.is('archived_at', null),
		supabase.from('brand_expenses').select('status, amount').eq('brand_id', brandId)
	]);

	// Performance metrics: orders for this brand (own-org orders only — federated orders are separate)
	const currentYear = new Date().getFullYear();
	const { data: brandOrders } = await supabase
		.from('orders')
		.select('id, account_id, total_amount, shipped_amount, status, order_year, created_at')
		.eq('brand_id', brandId)
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
		brand,
		brandAssets: assetsResult.data ?? [],
		productCount: productCountResult.count ?? 0,
		expenseSummary,
		performance,
		isFederated
	};
};
