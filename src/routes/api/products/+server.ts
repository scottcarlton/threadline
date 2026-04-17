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

	let query = locals.supabase
		.from('products')
		.select(
			'id, brand_id, season_id, product_year, style_number, name, wholesale_price, category, ats, product_variants(id, color, size, price_override), product_images(id, is_primary, sort_order)'
		)
		// (product_images included for modal grid thumbnails)
		.eq('organization_id', locals.organization.id)
		.eq('is_active', true)
		.is('archived_at', null)
		.order('style_number');

	if (brandIds.length > 0) query = query.in('brand_id', brandIds);
	if (seasonIds.length > 0) query = query.in('season_id', seasonIds);
	if (!Number.isNaN(minPrice)) query = query.gte('wholesale_price', minPrice);
	if (!Number.isNaN(maxPrice)) query = query.lte('wholesale_price', maxPrice);
	if (atsOnly) query = query.eq('ats', true);
	if (search) query = query.or(`style_number.ilike.%${search}%,name.ilike.%${search}%`);

	const { data } = await query.limit(limit);

	return json({ products: data ?? [] });
};
