import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { sanitizeSizeQtys, sanitizeSelectedColor } from '$lib/server/cart.js';

/**
 * Upsert one cart line. A line is keyed by (profile, product, colour), which
 * mirrors cartKey() on the client, so the same style in two colourways is two
 * rows rather than one row that overwrites itself.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json()) as {
		productId?: string;
		selectedColor?: unknown;
		sizeQtys?: unknown;
	};
	const productId = body.productId;
	if (!productId) {
		return json({ error: 'productId is required' }, { status: 400 });
	}

	const selectedColor = sanitizeSelectedColor(body.selectedColor);
	const sizeQtys = sanitizeSizeQtys(body.sizeQtys);

	// RLS-gated read: confirms the caller is allowed to see this product
	// (own org, federated, or buyer via get_buyer_brand_ids()) before we
	// insert into cart_items via the admin client.
	const { data: product, error: productErr } = await locals.supabase
		.from('products')
		.select('id')
		.eq('id', productId)
		.single();

	if (productErr || !product) {
		return json({ error: 'Product not found' }, { status: 404 });
	}

	// onConflict on the (profile, product, colour) key: re-adding a line the
	// buyer already has updates its quantities instead of failing on 23505.
	// added_at is left to the insert default so re-editing a line does not
	// reshuffle the cart order.
	const { error } = await supabaseAdmin.from('cart_items').upsert(
		{
			profile_id: locals.user.id,
			product_id: productId,
			selected_color: selectedColor,
			size_qtys: sizeQtys
		},
		{ onConflict: 'profile_id,product_id,selected_color' }
	);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { error } = await supabaseAdmin
		.from('cart_items')
		.delete()
		.eq('profile_id', locals.user.id);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
