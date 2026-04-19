import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('data:brands');
	depends('data:products');
	if (locals.isBuyer) throw redirect(303, '/shop');
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const brandId = params.id;

	// RLS handles federation visibility — just query by ID
	const { data: brand } = await supabase.from('brands').select('*').eq('id', brandId).single();

	if (!brand) throw error(404, 'Brand not found');

	const isFederated = brand.organization_id !== organization.id;

	const [assetsResult, productCountResult, expenseSummaryResult] = await Promise.all([
		supabase
			.from('brand_assets')
			.select('*')
			.eq('brand_id', brandId)
			.order('created_at', { ascending: false }),
		supabase
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

	// For federated brands, pull the brand org admin's profile as the contact
	let orgAdminContact: { display_name: string; email: string } | null = null;
	if (isFederated) {
		const { data: adminMember } = await supabaseAdmin
			.from('organization_members')
			.select('profiles!organization_members_profile_id_fkey(id, display_name)')
			.eq('organization_id', brand.organization_id)
			.in('role', ['admin', 'owner'])
			.limit(1)
			.single();

		if (adminMember) {
			const profile = adminMember.profiles as
				| { id: string; display_name: string }
				| { id: string; display_name: string }[]
				| null;
			const p = Array.isArray(profile) ? profile[0] : profile;
			if (p) {
				// Get the email from auth.users
				const { data: authData } = await supabaseAdmin.auth.admin.getUserById(p.id);
				orgAdminContact = {
					display_name: p.display_name ?? '',
					email: authData?.user?.email ?? ''
				};
			}
		}
	}

	return {
		brand,
		brandAssets: assetsResult.data ?? [],
		productCount: productCountResult.count ?? 0,
		expenseSummary,
		performance,
		isFederated,
		orgAdminContact
	};
};
