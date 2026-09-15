import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { sanitizeSelectedColor } from '$lib/server/cart.js';

/**
 * Remove cart lines for a product.
 *
 * With a `color` query param, only that colourway's line goes; without it,
 * every line for the product goes. Presence of the param is what distinguishes
 * the two, since `color=` is the legitimate value for a product with no
 * colourways.
 */
export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let query = supabaseAdmin
		.from('cart_items')
		.delete()
		.eq('profile_id', locals.user.id)
		.eq('product_id', params.productId);

	if (url.searchParams.has('color')) {
		query = query.eq('selected_color', sanitizeSelectedColor(url.searchParams.get('color')));
	}

	const { error } = await query;

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
