import type { SupabaseClient } from '@supabase/supabase-js';

export type TerritorySource = 'in_house' | 'agency';

export type TerritoryCoverageRow = {
	agencyOrgId: string;
	agencyName: string;
	source: TerritorySource;
	territoryId: string | null;
	territoryName: string;
	accounts: number;
	orders: number;
	revenue: number;
};

type RawRow = {
	agency_org_id: string;
	agency_name: string;
	source: TerritorySource;
	territory_id: string | null;
	territory_name: string;
	account_count: number | string;
	order_count: number | string;
	revenue: number | string;
};

export function mapTerritoryCoverageRow(raw: RawRow): TerritoryCoverageRow {
	return {
		agencyOrgId: raw.agency_org_id,
		agencyName: raw.agency_name,
		source: raw.source,
		territoryId: raw.territory_id,
		territoryName: raw.territory_name,
		accounts: Number(raw.account_count),
		orders: Number(raw.order_count),
		revenue: Number(raw.revenue)
	};
}

/**
 * Brand-side Territory Coverage — rows are (agency, territory) pairs
 * with at least one order for the brand. "Agency" is the org that
 * owns the account backing each order (the brand's own org for BOLSR
 * accounts, a connected rep org for MBISR accounts). Scoped via
 * get_brand_order_ids so BOLSR + MBISR orders are both represented.
 */
/**
 * Accepts `string | string[]` for `brandOrgId`. Nx-BLSR users union rows
 * across their brand-org memberships — (agency × territory × brand-org)
 * triples surface as separate rows so each brand-org's contribution is
 * visible.
 */
export async function loadTerritoryCoverage(
	supabase: SupabaseClient,
	brandOrgIdInput: string | string[],
	year: number
): Promise<TerritoryCoverageRow[]> {
	const ids = Array.isArray(brandOrgIdInput) ? brandOrgIdInput : [brandOrgIdInput];
	const batches = await Promise.all(
		ids.map((id) =>
			supabase.rpc('get_brand_territory_coverage', { brand_org_id: id, p_year: year })
		)
	);
	const firstError = batches.find((b) => b.error)?.error;
	if (firstError) throw firstError;
	return batches.flatMap((b) => ((b.data ?? []) as RawRow[]).map(mapTerritoryCoverageRow));
}
