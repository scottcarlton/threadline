import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import {
	getActiveConnection,
	matchVariantBySku,
	pullProductsPage,
	pullInventoryLevels,
	registerInventoryWebhook
} from '$lib/server/integrations/shopify';

export const POST: RequestHandler = async ({ locals, url }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const connection = await getActiveConnection(locals.organization.id);
	if (!connection) {
		return json({ error: 'Shopify not connected' }, { status: 409 });
	}

	// Idempotent: registers the inventory webhook if not already subscribed.
	// Derive origin from the URL of this request so prod/staging/dev all get distinct endpoints.
	// Failure is non-fatal — we log but don't abort sync; user can re-sync to retry.
	try {
		const callbackUrl = `${url.origin}/api/integrations/shopify/webhook`;
		await registerInventoryWebhook(connection, callbackUrl);
	} catch (err) {
		await supabaseAdmin.from('integration_sync_log').insert({
			organization_id: locals.organization.id,
			connection_id: connection.id,
			action: 'shopify.webhook.register',
			status: 'error',
			error_message: err instanceof Error ? err.message : 'Unknown error'
		});
		// Continue with sync anyway.
	}

	// Load own-org variants with non-null SKUs via products join (scopes correctly).
	const { data: localVariantRows } = await supabaseAdmin
		.from('product_variants')
		.select('id, sku, product_id, products!inner(id, organization_id)')
		.eq('products.organization_id', locals.organization.id);

	const localVariants = (localVariantRows ?? [])
		.filter((r) => r.sku !== null && r.sku !== '')
		.map((r) => ({ id: r.id, sku: r.sku as string | null, productId: r.product_id }));

	// productId → shopify_product_id we'll set after we see the Shopify product
	// that contains at least one matched variant.
	const localVariantIdToShopifyProductId = new Map<string, string>();
	const localVariantIdToShopifyVariantId = new Map<string, string>();
	const localVariantIdToInventoryItemId = new Map<string, string>();

	let matched = 0;
	let totalSeen = 0;

	let cursor: string | null = null;
	while (true) {
		const page = await pullProductsPage(connection, cursor);
		for (const p of page.products) {
			const shopifyVariantsWithSkus = p.variants.map((v) => ({
				id: v.shopifyVariantId,
				sku: v.sku
			}));
			const localById = localVariants.map((l) => ({ id: l.id, sku: l.sku }));
			const matchMap = matchVariantBySku(shopifyVariantsWithSkus, localById);
			totalSeen += p.variants.length;
			for (const [shopifyVariantId, localId] of Object.entries(matchMap)) {
				matched++;
				localVariantIdToShopifyProductId.set(localId, p.shopifyProductId);
				localVariantIdToShopifyVariantId.set(localId, shopifyVariantId);
				const shopifyVariant = p.variants.find((v) => v.shopifyVariantId === shopifyVariantId);
				if (shopifyVariant) {
					localVariantIdToInventoryItemId.set(localId, shopifyVariant.inventoryItemId);
				}
			}
		}
		if (!page.hasNextPage) break;
		cursor = page.endCursor;
	}

	// Write link columns — variant + product.
	// We batch variant updates one-by-one (small set expected in v1; optimize later if needed).
	for (const [localId, shopifyVariantId] of localVariantIdToShopifyVariantId) {
		const inventoryItemId = localVariantIdToInventoryItemId.get(localId) ?? null;
		await supabaseAdmin
			.from('product_variants')
			.update({
				shopify_variant_id: shopifyVariantId,
				shopify_inventory_item_id: inventoryItemId
			})
			.eq('id', localId);
	}

	// Write parent product links — dedupe first.
	const productIdToShopifyProductId = new Map<string, string>();
	for (const [localVariantId, shopifyProductId] of localVariantIdToShopifyProductId) {
		const parentProductId = localVariants.find((v) => v.id === localVariantId)?.productId;
		if (parentProductId) productIdToShopifyProductId.set(parentProductId, shopifyProductId);
	}
	for (const [productId, shopifyProductId] of productIdToShopifyProductId) {
		await supabaseAdmin
			.from('products')
			.update({ shopify_product_id: shopifyProductId })
			.eq('id', productId);
	}

	// Pull inventory levels for all matched inventory items.
	const inventoryItemIds = [...new Set(localVariantIdToInventoryItemId.values())];
	const levels = await pullInventoryLevels(connection, inventoryItemIds);

	// Write stock_qty to each matched variant.
	let inventoryWrites = 0;
	for (const [localId, inventoryItemId] of localVariantIdToInventoryItemId) {
		const qty = levels[inventoryItemId] ?? 0;
		await supabaseAdmin.from('product_variants').update({ stock_qty: qty }).eq('id', localId);
		inventoryWrites++;
	}

	const unmatched = totalSeen - matched;

	await supabaseAdmin.from('integration_sync_log').insert({
		organization_id: locals.organization.id,
		connection_id: connection.id,
		action: 'shopify.sync',
		status: 'success',
		details: {
			matched,
			unmatched,
			inventoryWrites,
			productsLinked: productIdToShopifyProductId.size
		},
		triggered_by: locals.user.id
	});

	return json({
		ok: true,
		matched,
		unmatched,
		inventoryWrites,
		productsLinked: productIdToShopifyProductId.size
	});
};
