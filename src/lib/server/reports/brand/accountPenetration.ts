import type { SupabaseClient } from '@supabase/supabase-js';

export type AccountSource = 'in_house' | 'agency';
export type AccountStatus = 'active' | 'dormant';
export type AccountTrend = 'up' | 'down' | 'flat';

export type AccountPenetrationRow = {
	accountId: string;
	businessName: string;
	agencyOrgId: string;
	agencyName: string;
	source: AccountSource;
	currentOrders: number;
	currentRevenue: number;
	priorRevenue: number;
	lastOrderDate: string | null;
	hasAccess: boolean;
	trend: AccountTrend;
	status: AccountStatus;
};

type RawRow = {
	account_id: string;
	business_name: string;
	agency_org_id: string;
	agency_name: string;
	source: AccountSource;
	current_orders: number | string;
	current_revenue: number | string;
	prior_revenue: number | string;
	last_order_date: string | null;
	has_access: boolean;
};

export function classifyAccountTrend(current: number, prior: number): AccountTrend {
	if (current === 0 && prior === 0) return 'flat';
	if (prior === 0) return current > 0 ? 'up' : 'flat';
	const ratio = (current - prior) / prior;
	if (ratio >= 0.1) return 'up';
	if (ratio <= -0.1) return 'down';
	return 'flat';
}

export function mapAccountPenetrationRow(raw: RawRow): AccountPenetrationRow {
	const currentOrders = Number(raw.current_orders);
	const currentRevenue = Number(raw.current_revenue);
	const priorRevenue = Number(raw.prior_revenue);
	return {
		accountId: raw.account_id,
		businessName: raw.business_name,
		agencyOrgId: raw.agency_org_id,
		agencyName: raw.agency_name,
		source: raw.source,
		currentOrders,
		currentRevenue,
		priorRevenue,
		lastOrderDate: raw.last_order_date,
		hasAccess: raw.has_access,
		trend: classifyAccountTrend(currentRevenue, priorRevenue),
		status: currentOrders > 0 ? 'active' : 'dormant'
	};
}

/**
 * Brand-side Account Penetration — one row per account relevant to
 * the brand (has ordered OR has brand access granted), showing
 * current-year activity vs. prior-year revenue for trend. "Dormant"
 * rows are accounts with zero current-year orders.
 */
/**
 * Accepts `string | string[]` for `brandOrgId`. Nx-BLSR: union per brand-org;
 * an account that orders both Brand A and Brand B surfaces as two separate
 * rows (one per brand-org) so per-brand activity stays distinguishable.
 */
export async function loadAccountPenetration(
	supabase: SupabaseClient,
	brandOrgIdInput: string | string[],
	year: number
): Promise<AccountPenetrationRow[]> {
	const ids = Array.isArray(brandOrgIdInput) ? brandOrgIdInput : [brandOrgIdInput];
	const batches = await Promise.all(
		ids.map((id) =>
			supabase.rpc('get_brand_account_penetration', { brand_org_id: id, p_year: year })
		)
	);
	const firstError = batches.find((b) => b.error)?.error;
	if (firstError) throw firstError;
	return batches.flatMap((b) => ((b.data ?? []) as RawRow[]).map(mapAccountPenetrationRow));
}
