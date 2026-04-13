import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ products: [] });
	}

	const brandId = url.searchParams.get('brand_id');
	const search = url.searchParams.get('q') ?? '';

	if (!brandId) return json({ products: [] });

	let query = locals.supabase
		.from('products')
		.select(
			'id, style_number, name, wholesale_price, category, product_variants(id, color, size, price_override), product_images(id, is_primary, sort_order)'
		)
		.eq('organization_id', locals.organization.id)
		.eq('brand_id', brandId)
		.eq('is_active', true)
		.is('archived_at', null)
		.order('style_number');

	if (search) {
		query = query.or(`style_number.ilike.%${search}%,name.ilike.%${search}%`);
	}

	const { data } = await query.limit(50);

	return json({ products: data ?? [] });
};
