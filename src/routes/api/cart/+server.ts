import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { productId } = (await request.json()) as { productId?: string };
	if (!productId) {
		return json({ error: 'productId is required' }, { status: 400 });
	}

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

	const { error } = await supabaseAdmin
		.from('cart_items')
		.insert({ profile_id: locals.user.id, product_id: productId })
		.select('id')
		.single();

	// Unique violation = already in cart, treat as success.
	if (error && error.code !== '23505') {
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
