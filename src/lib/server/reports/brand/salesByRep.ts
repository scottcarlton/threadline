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
 */
export async function loadSalesByRep(
	supabase: SupabaseClient,
	brandOrgId: string,
	year: number
): Promise<SalesByRepRow[]> {
	const { data, error } = await supabase.rpc('get_brand_sales_by_rep', {
		brand_org_id: brandOrgId,
		p_year: year
	});
	if (error) throw error;
	return ((data ?? []) as RawRow[]).map(mapSalesByRepRow);
}
