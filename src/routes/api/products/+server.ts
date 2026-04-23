import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ products: [] });
	}

	const search = url.searchParams.get('q') ?? '';
	const brandIds = url.searchParams.getAll('brand_id').filter(Boolean);
	const seasonIds = url.searchParams.getAll('season_id').filter(Boolean);
	const minPrice = parseFloat(url.searchParams.get('min_price') ?? '');
	const maxPrice = parseFloat(url.searchParams.get('max_price') ?? '');
	const atsOnly = url.searchParams.get('ats') === 'true';
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
	const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
	const category = url.searchParams.get('category') ?? '';
	const showArchived = url.searchParams.get('archived') === 'true';

	let query = locals.supabase
		.from('products')
		.select(
			'id, brand_id, season_id, product_year, style_number, name, wholesale_price, category, ats, archived_at, product_variants(id, color, size, price_override, stock_qty, stock_threshold, shopify_variant_id), product_images(id, is_primary, sort_order)',
			{ count: 'exact' }
		)
		// RLS handles org + federation visibility — no org_id filter here so
		// MBISR users can browse products from connected brand orgs.
		.eq('is_active', true)
		.order('style_number')
		.range(offset, offset + limit - 1);

	if (!showArchived) query = query.is('archived_at', null);
	if (brandIds.length > 0) query = query.in('brand_id', brandIds);
	if (seasonIds.length > 0) query = query.in('season_id', seasonIds);
	if (!Number.isNaN(minPrice)) query = query.gte('wholesale_price', minPrice);
	if (!Number.isNaN(maxPrice)) query = query.lte('wholesale_price', maxPrice);
	if (atsOnly) query = query.eq('ats', true);
	if (category) query = query.eq('category', category);
	if (search)
		query = query.or(
			`style_number.ilike.%${search}%,name.ilike.%${search}%,category.ilike.%${search}%`
		);

	const { data, count } = await query;
	const products = data ?? [];
	const totalCount = count ?? products.length;

	return json({ products, hasMore: offset + limit < totalCount });
};
