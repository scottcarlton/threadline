import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { verifyWebhookHmac } from '$lib/server/integrations/shopify';

export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.text();
	const hmac = request.headers.get('x-shopify-hmac-sha256');
	const topic = request.headers.get('x-shopify-topic');
	const shop = request.headers.get('x-shopify-shop-domain');

	if (!hmac || !topic || !shop) {
		return json({ error: 'Missing Shopify webhook headers' }, { status: 400 });
	}
	if (!verifyWebhookHmac(raw, hmac)) {
		return json({ error: 'Invalid HMAC' }, { status: 401 });
	}

	// Look up active Shopify connection by shop domain.
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('id, organization_id')
		.eq('provider', 'shopify')
		.eq('external_account_id', shop)
		.eq('status', 'active')
		.maybeSingle();

	if (!connection) {
		// Unknown or disconnected shop — acknowledge but noop (avoids Shopify retries on stale subscriptions).
		return json({ ok: true });
	}

	if (topic === 'inventory_levels/update') {
		const body = JSON.parse(raw) as {
			inventory_item_id: number;
			available: number;
		};
		const gid = `gid://shopify/InventoryItem/${body.inventory_item_id}`;

		await supabaseAdmin
			.from('product_variants')
			.update({ stock_qty: body.available })
			.eq('shopify_inventory_item_id', gid);

		await supabaseAdmin.from('integration_sync_log').insert({
			organization_id: connection.organization_id,
			connection_id: connection.id,
			action: 'shopify.webhook.inventory_levels_update',
			status: 'success',
			details: { inventory_item_id: gid, available: body.available }
		});
	}

	return json({ ok: true });
};
