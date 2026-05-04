import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { computeAccountHealth } from '$lib/server/account-health.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { loadManagerScope } from '$lib/server/scoping.js';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('data:accounts');
	if (locals.isBuyer) throw redirect(303, '/dashboard');
	const { organization, allMemberships } = locals;
	if (!organization)
		return { accounts: [], hasMore: false, totalCount: 0, accountTotals: {}, accountHealth: {} };

	const search = url.searchParams.get('search')?.trim() ?? '';

	const currentYear = new Date().getFullYear();

	// Nx-BLSR: own-org set is the union of every brand-org they're a sales-role
	// member of, NOT just the currently-active org. Federation is then layered
	// on top of that union (Brand A's connected reps + Brand B's connected reps
	// both surface). For everyone else, ownOrgIds = [organization.id] — the
	// existing single-org behavior is preserved as a strict superset.
	const brandOrgIds = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);
	const ownOrgIds = nxBlsr ? brandOrgIds : [organization.id];

	// Federation is asymmetric for accounts:
	//   Rep orgs (MBISR) see own accounts + all accounts from connected brand orgs (implicit).
	//   Brand orgs (BOA) see own accounts + only rep accounts explicitly linked via
	//   federated_account_links (created when an order is placed with that brand's products).
	const isBrandOrg = locals.orgType === 'brand';

	const orFilter = ownOrgIds
		.flatMap((id) => [`rep_org_id.eq.${id}`, `brand_org_id.eq.${id}`])
		.join(',');
	const { data: connections } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(orFilter);

	const connectedOrgIds = new Set<string>(ownOrgIds);
	let federatedAccountIds: string[] = [];

	if (isBrandOrg) {
		// Brand orgs only see rep accounts that have been explicitly linked
		// (via federated_account_links, created by the auto_federate_order trigger).
		// Still add connected brand org IDs (for nx-BLSR multi-brand visibility).
		for (const c of connections ?? []) {
			if (c.brand_org_id) connectedOrgIds.add(c.brand_org_id);
		}
		const { data: linkedAccounts } = await supabaseAdmin
			.from('federated_account_links')
			.select('account_id')
			.in('target_org_id', ownOrgIds);
		federatedAccountIds = (linkedAccounts ?? []).map((r) => r.account_id);
	} else {
		// Rep orgs see all accounts from connected brand orgs (implicit federation).
		for (const c of connections ?? []) {
			if (c.rep_org_id) connectedOrgIds.add(c.rep_org_id);
			if (c.brand_org_id) connectedOrgIds.add(c.brand_org_id);
		}
	}
	const visibleOrgIds = Array.from(connectedOrgIds);

	// Sales scope: territory-based visibility. Untagged accounts remain visible
	// (treated as "unclaimed") so orgs that haven't backfilled territories
	// aren't stranded. Sales with no territory assignments (and no managed
	// reports' territories) see today's full visible slice — no regression.
	const isSales = locals.membership?.role === 'sales';
	const salesScope =
		isSales && locals.user?.id
			? await loadManagerScope(supabaseAdmin, locals.user.id, locals.membership?.id ?? null)
			: null;

	// Admin client + explicit org scope (authenticated client can't reliably attach
	// session to RLS in this version of @supabase/ssr).
	// Build paginated accounts query with optional search.
	// Brand orgs: own-org accounts + explicitly federated account IDs.
	// Rep orgs: all accounts from visibleOrgIds (own + connected brand orgs).
	let accountsQuery = supabaseAdmin
		.from('accounts')
		.select('*, territories(name)', { count: 'exact' })
		.is('archived_at', null)
		.order('created_at', { ascending: false })
		.range(0, PAGE_SIZE - 1);

	if (isBrandOrg && federatedAccountIds.length > 0) {
		const orgList = visibleOrgIds.join(',');
		const idList = federatedAccountIds.join(',');
		accountsQuery = accountsQuery.or(`organization_id.in.(${orgList}),id.in.(${idList})`);
	} else {
		accountsQuery = accountsQuery.in('organization_id', visibleOrgIds);
	}

	if (salesScope?.hasTerritoryScope) {
		const territoryIds = salesScope.visibleTerritoryIds.join(',');
		accountsQuery = accountsQuery.or(`territory_id.in.(${territoryIds}),territory_id.is.null`);
	}

	if (search) {
		const pattern = `%${search}%`;
		accountsQuery = accountsQuery.or(
			`business_name.ilike.${pattern},contact_first_name.ilike.${pattern},contact_last_name.ilike.${pattern},city.ilike.${pattern},state.ilike.${pattern}`
		);
	}

	const [accountsRes, ordersRes, healthMap, tagAssignmentsRes] = await Promise.all([
		accountsQuery,
		// YTD totals span every org the viewer can see accounts for. For a BOA,
		// most account orders are created by the connected rep org (different
		// organization_id), so a self-org filter would zero them out.
		supabaseAdmin
			.from('orders')
			.select('account_id, total_amount')
			.in('organization_id', visibleOrgIds)
			.eq('order_year', currentYear),
		// Health across every org the viewer can see accounts for — so federated
		// accounts show a score too, computed against their own org's orders.
		computeAccountHealth(supabaseAdmin, visibleOrgIds),
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

	const totalCount = accountsRes.count ?? accounts.length;

	return {
		accounts,
		hasMore: totalCount > PAGE_SIZE,
		totalCount,
		accountTotals: totals,
		accountHealth,
		accountTags: accountTagMap
	};
};
