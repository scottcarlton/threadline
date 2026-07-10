import { error, redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.isBuyer) throw redirect(303, '/insight');

	const buyerBrandIds = locals.buyerBrandIds ?? [];

	const { data: product, error: err } = await supabaseAdmin
		.from('products')
		.select(
			'*, brands(id, name), seasons(id, name), product_variants(id, color, color_hex, size, sku, stock_qty, stock_threshold, shopify_variant_id), product_images(id, file_path, is_primary, sort_order, variant_id, role)'
		)
		.eq('id', params.productId)
		.eq('is_active', true)
		.is('archived_at', null)
		.single();

	if (err || !product) throw error(404, 'Product not found');

	// A buyer with no brand access (e.g. a self-signup store not yet linked
	// to any brand) can see nothing. An empty list means no access, never
	// unrestricted access — this load uses supabaseAdmin, so RLS does not
	// gate it.
	if (!buyerBrandIds.includes(product.brand_id)) {
		throw error(403, 'Access denied');
	}

	// Sort images: primary first, then by sort_order
	if (product.product_images) {
		product.product_images.sort(
			(
				a: { is_primary?: boolean; sort_order?: number },
				b: { is_primary?: boolean; sort_order?: number }
			) => {
				if (a.is_primary && !b.is_primary) return -1;
				if (!a.is_primary && b.is_primary) return 1;
				return (a.sort_order ?? 0) - (b.sort_order ?? 0);
			}
		);
	}

	return { product };
};
