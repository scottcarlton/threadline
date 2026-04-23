import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	// Soft-disconnect: preserves product_variants.shopify_*_id mappings so reconnect
	// is idempotent. Variant stock_qty values remain as last-synced until the user
	// explicitly resets them. Hard-delete is reserved for the case where the shop
	// changes entirely (different Shopify store).
	const { error } = await supabaseAdmin
		.from('integration_connections')
		.update({ status: 'disconnected', updated_at: new Date().toISOString() })
		.eq('organization_id', locals.organization!.id)
		.eq('provider', 'shopify');

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
