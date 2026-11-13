import { loadOrderScope } from '$lib/server/reports/order-scope.js';
import { logSupabaseError } from '$lib/server/log-supabase-error.js';
import { buildSalesTrend, trendWindowStart, type SalesTrend } from '$lib/utils/sales-trend.js';

export type TrendBrand = { id: string; name: string };

/** PostgREST returns at most this many rows per request. */
const PAGE = 1000;

/**
 * The Insights sales trend for a rep org (SCO-148).
 *
 * Counts the same orders Reports does: non-cancelled, the viewer's brand
 * access, and a sales member's own, managed and territory orders. Reads go
 * through the request client, so RLS applies on top.
 *
 * `brandParam` is honored only when it names a brand the viewer can see;
 * anything else is ignored and the trend covers all their brands.
 */
export async function loadSalesTrend(
	locals: App.Locals,
	orgId: string,
	brandParam: string | null,
	now = new Date()
): Promise<{ trend: SalesTrend; brands: TrendBrand[]; selectedBrandId: string | null }> {
	const { supabase } = locals;
	const brandScope = locals.brandScope as string[] | null;

	let brandQuery = supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', orgId)
		.eq('is_active', true)
		.order('name', { ascending: true });
	if (brandScope && brandScope.length > 0) brandQuery = brandQuery.in('id', brandScope);
	const { data: brandRows, error: brandError } = await brandQuery;
	logSupabaseError('sales trend brands', brandError);
	const brands = (brandRows ?? []) as TrendBrand[];

	const selectedBrandId = brandParam && brands.some((b) => b.id === brandParam) ? brandParam : null;

	const { scopeByBrand, scopeByRep } = await loadOrderScope(locals, orgId);
	const since = trendWindowStart(now).toISOString();

	const rows: Array<{ created_at: string; total_amount: number | string | null }> = [];
	for (let from = 0; ; from += PAGE) {
		let query = supabase
			.from('orders')
			.select('id, created_at, total_amount')
			.eq('organization_id', orgId)
			.neq('status', 'cancelled')
			.gte('created_at', since);
		if (selectedBrandId) query = query.eq('brand_id', selectedBrandId);
		const { data, error } = await scopeByRep(scopeByBrand(query))
			.order('id', { ascending: true })
			.range(from, from + PAGE - 1);
		logSupabaseError('sales trend orders', error);
		const page = (data ?? []) as typeof rows;
		rows.push(...page);
		if (error || page.length < PAGE) break;
	}

	return { trend: buildSalesTrend(rows, now), brands, selectedBrandId };
}
