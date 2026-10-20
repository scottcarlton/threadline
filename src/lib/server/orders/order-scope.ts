import { supabaseAdmin } from '$lib/server/supabase.js';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';

/**
 * Which orgs an order writer can reach, resolved from active `org_connections`.
 *
 * Shared by the order pickers (`loadOrderPrereqs`) and the submit-time
 * authorization (`authorizeSubmitPayload`) so the two can never drift: an ID
 * the picker could not have offered is an ID the submit path rejects. Both run
 * on `supabaseAdmin`, so this scope is the only thing standing in for RLS.
 */
export type OrderScope = {
	ownOrgIds: string[];
	/** Own orgs plus every directly connected partner, both directions. */
	visibleOrgIds: string[];
	/** visibleOrgIds plus sibling rep orgs that share a connected brand. */
	repVisibleOrgIds: string[];
	connectedBrandOrgIds: Set<string>;
	connectedRepOrgIds: Set<string>;
	isBuyer: boolean;
	buyerAccountIds: string[] | null;
	buyerBrandIds: string[] | null;
	isBrandOrg: boolean;
};

export async function resolveOrderScope(locals: App.Locals, orgId: string): Promise<OrderScope> {
	const isBuyer = locals.isBuyer ?? false;
	const buyerAccountIds = isBuyer ? (locals.buyerAccounts?.map((a) => a.account_id) ?? []) : null;
	const buyerBrandIds = isBuyer ? (locals.buyerBrandIds ?? []) : null;
	const isBrandOrg = locals.orgType === 'brand';

	const brandOrgIds = getNxBlsrBrandOrgIds(locals.allMemberships);
	const ownOrgIds = isNxBlsr(brandOrgIds) ? brandOrgIds : [orgId];
	const ownOrgIdSet = new Set(ownOrgIds);

	const orFilter = ownOrgIds
		.flatMap((id) => [`rep_org_id.eq.${id}`, `brand_org_id.eq.${id}`])
		.join(',');
	const { data: conns } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(orFilter);
	const visibleOrgIdSet = new Set<string>(ownOrgIds);
	const connectedBrandOrgIds = new Set<string>();
	const connectedRepOrgIds = new Set<string>();
	for (const c of conns ?? []) {
		if (c.rep_org_id && !ownOrgIdSet.has(c.rep_org_id)) visibleOrgIdSet.add(c.rep_org_id);
		if (c.brand_org_id && !ownOrgIdSet.has(c.brand_org_id)) visibleOrgIdSet.add(c.brand_org_id);
		if (c.rep_org_id && ownOrgIdSet.has(c.rep_org_id) && c.brand_org_id) {
			connectedBrandOrgIds.add(c.brand_org_id);
		}
		if (c.brand_org_id && ownOrgIdSet.has(c.brand_org_id) && c.rep_org_id) {
			connectedRepOrgIds.add(c.rep_org_id);
		}
	}

	const repVisibleOrgIdSet = new Set(visibleOrgIdSet);
	if (connectedBrandOrgIds.size > 0) {
		const { data: siblingConns } = await supabaseAdmin
			.from('org_connections')
			.select('rep_org_id, brand_org_id')
			.eq('status', 'active')
			.in('brand_org_id', Array.from(connectedBrandOrgIds))
			.not('rep_org_id', 'in', `(${ownOrgIds.join(',')})`);
		for (const sc of siblingConns ?? []) {
			if (sc.rep_org_id) {
				repVisibleOrgIdSet.add(sc.rep_org_id);
				connectedRepOrgIds.add(sc.rep_org_id);
			}
		}
	}

	return {
		ownOrgIds,
		visibleOrgIds: Array.from(visibleOrgIdSet),
		repVisibleOrgIds: Array.from(repVisibleOrgIdSet),
		connectedBrandOrgIds,
		connectedRepOrgIds,
		isBuyer,
		buyerAccountIds,
		buyerBrandIds,
		isBrandOrg
	};
}
