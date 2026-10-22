import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogProduct } from '$lib/components/shared/catalog-picker-types';

/** The columns the catalog picker reads; same shape as GET /api/products. */
export const CATALOG_SELECT =
	'id, brand_id, season_id, product_year, style_number, name, wholesale_price, category, ats, archived_at, product_variants(id, color, color_hex, size, price_override, stock_qty, stock_threshold, shopify_variant_id), product_images(id, is_primary, sort_order, role, variant_id)';

/** PostgREST caps a response at 1000 rows by default. */
export const CATALOG_PAGE = 1000;

/**
 * Every active, unarchived product of the given brands, paged past the row
 * cap. Runs through the caller's RLS client: brand ids come from the order
 * pickers' scope, and RLS on products is the second gate. Empty scope returns
 * nothing, never everything.
 */
export async function loadCatalog(
	supabase: SupabaseClient,
	brandIds: string[]
): Promise<CatalogProduct[]> {
	if (brandIds.length === 0) return [];
	const out: CatalogProduct[] = [];
	for (let from = 0; ; from += CATALOG_PAGE) {
		const { data, error } = await supabase
			.from('products')
			.select(CATALOG_SELECT)
			.in('brand_id', brandIds)
			.eq('is_active', true)
			.is('archived_at', null)
			.order('style_number')
			.order('id')
			.range(from, from + CATALOG_PAGE - 1);
		if (error) throw error;
		const rows = (data ?? []) as unknown as CatalogProduct[];
		out.push(...rows);
		if (rows.length < CATALOG_PAGE) return out;
	}
}
