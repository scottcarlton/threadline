import { error, redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.isBuyer) throw redirect(303, '/insight');

	const buyerBrandIds = locals.buyerBrandIds ?? [];

	const { data: product, error: err } = await supabaseAdmin
		.from('products')
		.select('*, brands(id, name), product_variants(id, color, size, sku), product_images(id, file_path, is_primary, sort_order)')
		.eq('id', params.productId)
		.eq('is_active', true)
		.is('archived_at', null)
		.single();

	if (err || !product) throw error(404, 'Product not found');

	// Verify buyer has access to this brand
	if (buyerBrandIds.length > 0 && !buyerBrandIds.includes(product.brand_id)) {
		throw error(403, 'Access denied');
	}

	// Sort images: primary first, then by sort_order
	if (product.product_images) {
		product.product_images.sort((a: any, b: any) => {
			if (a.is_primary && !b.is_primary) return -1;
			if (!a.is_primary && b.is_primary) return 1;
			return (a.sort_order ?? 0) - (b.sort_order ?? 0);
		});
	}

	return { product };
};
