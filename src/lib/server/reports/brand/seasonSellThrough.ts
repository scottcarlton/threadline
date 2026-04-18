import type { SupabaseClient } from '@supabase/supabase-js';

export type SeasonSellThroughRow = {
	seasonId: string;
	seasonName: string;
	isActive: boolean;
	productsInSeason: number;
	productsOrdered: number;
	sellThroughPct: number;
	totalUnits: number;
	totalRevenue: number;
	orders: number;
	accounts: number;
};

type RawRow = {
	season_id: string;
	season_name: string;
	sort_order: number;
	is_active: boolean;
	products_in_season: number | string;
	products_ordered: number | string;
	total_units: number | string;
	total_revenue: number | string;
	order_count: number | string;
	account_count: number | string;
};

/**
 * Sell-through = (products_ordered / products_in_season) * 100, rounded
 * to a whole number. If the brand has no active products in a season,
 * the rate is 0. A value above 100 is not possible (products_ordered is
 * a subset of products_in_season).
 */
export function computeSellThroughPct(ordered: number, inSeason: number): number {
	if (inSeason <= 0) return 0;
	return Math.round((ordered / inSeason) * 100);
}

export function mapSeasonSellThroughRow(raw: RawRow): SeasonSellThroughRow {
	const productsInSeason = Number(raw.products_in_season);
	const productsOrdered = Number(raw.products_ordered);
	return {
		seasonId: raw.season_id,
		seasonName: raw.season_name,
		isActive: raw.is_active,
		productsInSeason,
		productsOrdered,
		sellThroughPct: computeSellThroughPct(productsOrdered, productsInSeason),
		totalUnits: Number(raw.total_units),
		totalRevenue: Number(raw.total_revenue),
		orders: Number(raw.order_count),
		accounts: Number(raw.account_count)
	};
}

/**
 * Brand-side Season Sell-Through — one row per season owned by the
 * brand org, with catalog sell-through (% of active styles that have
 * sold), plus units, revenue, orders, accounts. Orders scoped via
 * get_brand_order_ids so BOLSR + MBISR orders both count.
 */
export async function loadSeasonSellThrough(
	supabase: SupabaseClient,
	brandOrgId: string,
	year: number
): Promise<SeasonSellThroughRow[]> {
	const { data, error } = await supabase.rpc('get_brand_season_sell_through', {
		brand_org_id: brandOrgId,
		p_year: year
	});
	if (error) throw error;
	return ((data ?? []) as RawRow[]).map(mapSeasonSellThroughRow);
}
