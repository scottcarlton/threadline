import type { SupabaseClient } from '@supabase/supabase-js';

export type RepSource = 'in_house' | 'agency';

export type SalesByRepRow = {
	repUserId: string;
	repName: string;
	agencyOrgId: string;
	agencyName: string;
	source: RepSource;
	orders: number;
	revenue: number;
	avgOrderValue: number;
	lastOrderDate: string | null;
};

type RawRow = {
	rep_user_id: string;
	rep_name: string;
	agency_org_id: string;
	agency_name: string;
	source: RepSource;
	order_count: number | string;
	revenue: number | string;
	avg_order_value: number | string;
	last_order_date: string | null;
};

export function mapSalesByRepRow(raw: RawRow): SalesByRepRow {
	return {
		repUserId: raw.rep_user_id,
		repName: raw.rep_name,
		agencyOrgId: raw.agency_org_id,
		agencyName: raw.agency_name,
		source: raw.source,
		orders: Number(raw.order_count),
		revenue: Number(raw.revenue),
		avgOrderValue: Number(raw.avg_order_value),
		lastOrderDate: raw.last_order_date
	};
}

/**
 * Brand-side "Sales by Rep" — one row per user who has placed an order
 * for any brand owned by `brandOrgId`, combining BOLSR (same-org sales
 * reps) and MBISR (users in connected rep orgs). Order visibility is
 * resolved by the `get_brand_order_ids` SQL helper.
 *
 * Accepts `string | string[]` for `brandOrgId`. Single string preserves the
 * existing single-org behavior. An array (used by Nx-BLSR — sales-role member
 * of multiple brand-orgs) calls the RPC per-org in parallel and concatenates
 * the row sets so each (rep × brand-org) pair surfaces as its own row.
 */
export async function loadSalesByRep(
	supabase: SupabaseClient,
	brandOrgIdInput: string | string[],
	year: number
): Promise<SalesByRepRow[]> {
	const ids = Array.isArray(brandOrgIdInput) ? brandOrgIdInput : [brandOrgIdInput];
	const batches = await Promise.all(
		ids.map((id) => supabase.rpc('get_brand_sales_by_rep', { brand_org_id: id, p_year: year }))
	);
	const firstError = batches.find((b) => b.error)?.error;
	if (firstError) throw firstError;
	const rows = batches.flatMap((b) => (b.data ?? []) as RawRow[]);
	return rows.map(mapSalesByRepRow);
}
