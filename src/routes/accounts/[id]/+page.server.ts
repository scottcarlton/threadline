import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { computeAccountHealth } from '$lib/server/account-health.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, '/dashboard');
	const { supabase, organization } = locals;

	const [accountRes, ordersRes] = await Promise.all([
		supabase
			.from('accounts')
			.select('*')
			.eq('id', params.id)
			.single(),
		supabase
			.from('orders')
			.select('brand_id, total_amount, status, order_year, brands(id, name)')
			.eq('account_id', params.id)
	]);

	if (accountRes.error || !accountRes.data) {
		throw error(404, 'Account not found');
	}

	// Aggregate brand stats from orders
	type BrandSummary = { id: string; name: string; orderCount: number; totalSales: number };
	const brandMap = new Map<string, BrandSummary>();

	for (const order of ordersRes.data ?? []) {
		const brand = order.brands as unknown as { id: string; name: string } | null;
		if (!brand) continue;

		const existing = brandMap.get(brand.id);
		if (existing) {
			existing.orderCount++;
			existing.totalSales += Number(order.total_amount);
		} else {
			brandMap.set(brand.id, {
				id: brand.id,
				name: brand.name,
				orderCount: 1,
				totalSales: Number(order.total_amount)
			});
		}
	}

	const brandSummaries = Array.from(brandMap.values()).sort((a, b) => b.totalSales - a.totalSales);

	// Get health score for this account
	let health = null;
	if (organization) {
		const healthMap = await computeAccountHealth(supabase, organization.id);
		health = healthMap.get(params.id) ?? null;
	}

	// Load buyer users for this account
	const { data: buyerUsers } = await supabase
		.from('account_users')
		.select('*, profiles(display_name)')
		.eq('account_id', params.id);

	// Load buyer brand access
	const { data: buyerBrandAccess } = await supabase
		.from('account_brand_access')
		.select('*, brands(name)')
		.eq('account_id', params.id);

	// Load pending buyer invitations
	const { data: buyerInvitations } = await supabase
		.from('buyer_invitations')
		.select('*')
		.eq('account_id', params.id)
		.is('accepted_at', null);

	// Load all brands for the invite dialog
	const { data: allBrands } = organization
		? await supabase
			.from('brands')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('name')
		: { data: [] };

	return {
		account: accountRes.data,
		brandSummaries,
		accountHealth: health,
		buyerUsers: buyerUsers ?? [],
		buyerBrandAccess: buyerBrandAccess ?? [],
		buyerInvitations: buyerInvitations ?? [],
		allBrands: allBrands ?? []
	};
};
