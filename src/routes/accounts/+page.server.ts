import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { computeAccountHealth } from '$lib/server/account-health.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.isBuyer) throw redirect(303, '/dashboard');
	const { supabase, organization } = locals;
	if (!organization) return { accounts: [], accountTotals: {}, accountHealth: {} };

	const currentYear = new Date().getFullYear();

	const [accountsRes, ordersRes, healthMap, tagAssignmentsRes] = await Promise.all([
		supabase
			.from('accounts')
			.select('*, territories(name)')
			.eq('organization_id', organization.id)
			.order('business_name'),
		supabase
			.from('orders')
			.select('account_id, total_amount')
			.eq('organization_id', organization.id)
			.eq('order_year', currentYear),
		computeAccountHealth(supabase, organization.id),
		supabase.from('account_tag_assignments').select('account_id, account_tags(id, name, color)')
	]);

	// Build YTD totals per account
	const totals: Record<string, number> = {};
	for (const order of ordersRes.data ?? []) {
		totals[order.account_id] = (totals[order.account_id] ?? 0) + Number(order.total_amount);
	}

	// Convert health map to serializable object
	const accountHealth: Record<string, ReturnType<typeof healthMap.get>> = {};
	for (const [id, health] of healthMap) {
		accountHealth[id] = health;
	}

	// Build tag map per account
	const accountTagMap: Record<string, { id: string; name: string; color: string }[]> = {};
	type TagJoin = { id: string; name: string; color: string };
	for (const assignment of tagAssignmentsRes.data ?? []) {
		const joined = assignment.account_tags as TagJoin | TagJoin[] | null;
		const tag = Array.isArray(joined) ? joined[0] : joined;
		if (!tag) continue;
		if (!accountTagMap[assignment.account_id]) accountTagMap[assignment.account_id] = [];
		accountTagMap[assignment.account_id].push({ id: tag.id, name: tag.name, color: tag.color });
	}

	return {
		accounts: accountsRes.data ?? [],
		accountTotals: totals,
		accountHealth,
		accountTags: accountTagMap
	};
};
