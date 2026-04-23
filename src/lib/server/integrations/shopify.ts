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
