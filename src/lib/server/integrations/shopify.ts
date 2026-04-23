import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '../supabase.js';
import type { IntegrationConnection } from '$lib/types/database.js';

const REDIRECT_PATH = '/api/integrations/shopify/callback';
const MYSHOPIFY_SUFFIX = '.myshopify.com';

export function normalizeShopDomain(input: string): string {
	const trimmed = input
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/\/$/, '');
	if (!trimmed) throw new Error('Shop domain is required');
	if (trimmed.endsWith(MYSHOPIFY_SUFFIX)) {
		if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(trimmed)) {
			throw new Error('Invalid Shopify shop domain');
		}
		return trimmed;
	}
	if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
		throw new Error('Invalid Shopify shop handle');
	}
	return `${trimmed}${MYSHOPIFY_SUFFIX}`;
}

export function buildAuthUrl(opts: {
	shop: string;
	origin: string;
	state: string;
	clientId?: string;
	scopes?: string;
}): string {
	const clientId = opts.clientId ?? env.SHOPIFY_CLIENT_ID ?? '';
	const scopes = opts.scopes ?? env.SHOPIFY_SCOPES ?? '';
	const params = new URLSearchParams({
		client_id: clientId,
		scope: scopes,
		redirect_uri: `${opts.origin}${REDIRECT_PATH}`,
		state: opts.state
	});
	return `https://${opts.shop}/admin/oauth/authorize?${params}`;
}

export async function exchangeCode(opts: {
	shop: string;
	code: string;
}): Promise<{ accessToken: string; scope: string }> {
	const res = await fetch(`https://${opts.shop}/admin/oauth/access_token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: env.SHOPIFY_CLIENT_ID,
			client_secret: env.SHOPIFY_CLIENT_SECRET,
			code: opts.code
		})
	});
	if (!res.ok) {
		throw new Error(`Shopify token exchange failed: ${res.status}`);
	}
	const data = (await res.json()) as { access_token: string; scope: string };
	return { accessToken: data.access_token, scope: data.scope };
}

export function verifyWebhookHmac(
	rawBody: string,
	signatureB64: string,
	secret: string = env.SHOPIFY_CLIENT_SECRET ?? ''
): boolean {
	const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
	const digestBuf = Buffer.from(digest);
	const sigBuf = Buffer.from(signatureB64);
	if (digestBuf.length !== sigBuf.length) return false;
	try {
		return crypto.timingSafeEqual(digestBuf, sigBuf);
	} catch {
		return false;
	}
}

export function matchVariantBySku(
	shopify: Array<{ id: string; sku: string | null }>,
	local: Array<{ id: string; sku: string | null }>
): Record<string, string> {
	const byKey = new Map<string, string>();
	for (const v of local) {
		if (!v.sku) continue;
		const key = v.sku.trim().toLowerCase();
		if (!key) continue;
		byKey.set(key, v.id);
	}
	const out: Record<string, string> = {};
	for (const v of shopify) {
		if (!v.sku) continue;
		const key = v.sku.trim().toLowerCase();
		if (!key) continue;
		const match = byKey.get(key);
		if (match) out[v.id] = match;
	}
	return out;
}

export async function getActiveConnection(
	organizationId: string
): Promise<IntegrationConnection | null> {
	const { data } = await supabaseAdmin
		.from('integration_connections')
		.select('*')
		.eq('organization_id', organizationId)
		.eq('provider', 'shopify')
		.eq('status', 'active')
		.maybeSingle();
	return data as IntegrationConnection | null;
}

export async function graphql<T>(
	connection: IntegrationConnection,
	query: string,
	variables?: Record<string, unknown>
): Promise<T> {
	const shop = (connection.config as { shop?: string } | null)?.shop;
	if (!shop) throw new Error('Shopify connection missing shop domain in config');
	const res = await fetch(`https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Shopify-Access-Token': connection.access_token
		},
		body: JSON.stringify({ query, variables })
	});
	if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}`);
	const body = (await res.json()) as { data: T; errors?: Array<{ message: string }> };
	if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
	return body.data;
}

export type ShopifyVariantLink = {
	shopifyVariantId: string;
	sku: string | null;
	inventoryItemId: string;
};

export type ShopifyProductPage = {
	products: Array<{
		shopifyProductId: string;
		variants: ShopifyVariantLink[];
	}>;
	hasNextPage: boolean;
	endCursor: string | null;
};

export async function pullProductsPage(
	connection: IntegrationConnection,
	cursor: string | null
): Promise<ShopifyProductPage> {
	const query = `
		query PullProductsPage($cursor: String) {
		  products(first: 50, after: $cursor) {
		    edges {
		      node {
		        id
		        variants(first: 100) {
		          edges {
		            node {
		              id
		              sku
		              inventoryItem {
		                id
		              }
		            }
		          }
		        }
		      }
		    }
		    pageInfo {
		      hasNextPage
		      endCursor
		    }
		  }
		}
	`;
	const data = await graphql<{
		products: {
			edges: Array<{
				node: {
					id: string;
					variants: {
						edges: Array<{
							node: {
								id: string;
								sku: string | null;
								inventoryItem: { id: string } | null;
							};
						}>;
					};
				};
			}>;
			pageInfo: { hasNextPage: boolean; endCursor: string | null };
		};
	}>(connection, query, { cursor });

	return {
		products: data.products.edges.map((e) => ({
			shopifyProductId: e.node.id,
			variants: e.node.variants.edges
				.filter((v) => v.node.inventoryItem !== null)
				.map((v) => ({
					shopifyVariantId: v.node.id,
					sku: v.node.sku,
					inventoryItemId: v.node.inventoryItem!.id
				}))
		})),
		hasNextPage: data.products.pageInfo.hasNextPage,
		endCursor: data.products.pageInfo.endCursor
	};
}

export async function registerInventoryWebhook(
	connection: IntegrationConnection,
	callbackUrl: string
): Promise<{ registered: boolean; existingId: string | null }> {
	const listQuery = `
		query ListInventoryWebhooks {
		  webhookSubscriptions(first: 50, topics: [INVENTORY_LEVELS_UPDATE]) {
		    edges {
		      node {
		        id
		        uri
		      }
		    }
		  }
		}
	`;
	const listData = await graphql<{
		webhookSubscriptions: {
			edges: Array<{
				node: {
					id: string;
					uri: string | null;
				};
			}>;
		};
	}>(connection, listQuery);

	const existing = listData.webhookSubscriptions.edges.find((e) => e.node.uri === callbackUrl);

	if (existing) {
		return { registered: false, existingId: existing.node.id };
	}

	const createMutation = `
		mutation CreateInventoryWebhook($callbackUrl: String!) {
		  webhookSubscriptionCreate(
		    topic: INVENTORY_LEVELS_UPDATE
		    webhookSubscription: { uri: $callbackUrl, format: JSON }
		  ) {
		    webhookSubscription {
		      id
		    }
		    userErrors {
		      field
		      message
		    }
		  }
		}
	`;
	const createData = await graphql<{
		webhookSubscriptionCreate: {
			webhookSubscription: { id: string } | null;
			userErrors: Array<{ field: string[] | null; message: string }>;
		};
	}>(connection, createMutation, { callbackUrl });

	if (createData.webhookSubscriptionCreate.userErrors.length) {
		throw new Error(
			createData.webhookSubscriptionCreate.userErrors
				.map((e) => `${e.field?.join('.') ?? ''}: ${e.message}`)
				.join('; ')
		);
	}

	return {
		registered: true,
		existingId: createData.webhookSubscriptionCreate.webhookSubscription?.id ?? null
	};
}

export async function pullInventoryLevels(
	connection: IntegrationConnection,
	inventoryItemIds: string[]
): Promise<Record<string, number>> {
	if (inventoryItemIds.length === 0) return {};

	const query = `
		query PullInventoryLevels($ids: [ID!]!) {
		  nodes(ids: $ids) {
		    ... on InventoryItem {
		      id
		      inventoryLevels(first: 50) {
		        edges {
		          node {
		            quantities(names: ["available"]) {
		              name
		              quantity
		            }
		          }
		        }
		      }
		    }
		  }
		}
	`;
	const BATCH = 100; // Admin "nodes" limit — chunk to be safe
	const out: Record<string, number> = {};

	for (let i = 0; i < inventoryItemIds.length; i += BATCH) {
		const batch = inventoryItemIds.slice(i, i + BATCH);
		const data = await graphql<{
			nodes: Array<{
				id: string;
				inventoryLevels: {
					edges: Array<{
						node: {
							quantities: Array<{ name: string; quantity: number | null }>;
						};
					}>;
				};
			} | null>;
		}>(connection, query, { ids: batch });

		for (const node of data.nodes) {
			if (!node) continue;
			const total = node.inventoryLevels.edges.reduce((sum, e) => {
				const availableEntry = e.node.quantities.find((q) => q.name === 'available');
				return sum + (availableEntry?.quantity ?? 0);
			}, 0);
			out[node.id] = total;
		}
	}

	return out;
}
