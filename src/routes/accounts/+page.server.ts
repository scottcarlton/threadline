import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { computeAccountHealth } from '$lib/server/account-health.js';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.isBuyer) throw redirect(303, '/dashboard');
	const { organization } = locals;
	if (!organization) return { accounts: [], accountTotals: {}, accountHealth: {} };

	const currentYear = new Date().getFullYear();

	// Build the list of org IDs this user can see accounts for:
	// own org + any org connected via an active org_connections row (either direction).
	const { data: connections } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${organization.id},brand_org_id.eq.${organization.id}`);

	const connectedOrgIds = new Set<string>([organization.id]);
	for (const c of connections ?? []) {
		if (c.rep_org_id && c.rep_org_id !== organization.id) connectedOrgIds.add(c.rep_org_id);
		if (c.brand_org_id && c.brand_org_id !== organization.id) connectedOrgIds.add(c.brand_org_id);
	}
	const visibleOrgIds = Array.from(connectedOrgIds);

	// Admin client + explicit org scope (authenticated client can't reliably attach
	// session to RLS in this version of @supabase/ssr).
	const [accountsRes, ordersRes, healthMap, tagAssignmentsRes] = await Promise.all([
		supabaseAdmin
			.from('accounts')
			.select('*, territories(name)')
			.in('organization_id', visibleOrgIds)
			.order('business_name'),
		supabaseAdmin
			.from('orders')
			.select('account_id, total_amount')
			.eq('organization_id', organization.id)
			.eq('order_year', currentYear),
		computeAccountHealth(supabaseAdmin, organization.id),
		supabaseAdmin
			.from('account_tag_assignments')
			.select('account_id, account_tags(id, name, color)')
	]);

	const accounts = accountsRes.data ?? [];

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
		accounts,
		accountTotals: totals,
		accountHealth,
		accountTags: accountTagMap
	};
};
