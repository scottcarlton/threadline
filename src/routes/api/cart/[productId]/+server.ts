import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { error } = await supabaseAdmin
		.from('cart_items')
		.delete()
		.eq('profile_id', locals.user.id)
		.eq('product_id', params.productId);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
