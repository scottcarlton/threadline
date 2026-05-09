import { describe, expect, it } from 'vitest';
import { buildAuthUrl, verifyWebhookHmac, matchVariantBySku, normalizeShopDomain } from './shopify';

describe('normalizeShopDomain', () => {
	it('accepts bare handle and appends .myshopify.com', () => {
		expect(normalizeShopDomain('acme')).toBe('acme.myshopify.com');
	});
	it('passes through full domain', () => {
		expect(normalizeShopDomain('acme.myshopify.com')).toBe('acme.myshopify.com');
	});
	it('strips protocol and trailing slash', () => {
		expect(normalizeShopDomain('https://acme.myshopify.com/')).toBe('acme.myshopify.com');
	});
	it('lowercases before validation', () => {
		expect(normalizeShopDomain('ACME')).toBe('acme.myshopify.com');
	});
	it('rejects non-myshopify domains', () => {
		expect(() => normalizeShopDomain('example.com')).toThrow();
	});
	it('rejects empty input', () => {
		expect(() => normalizeShopDomain('')).toThrow();
	});
	it('rejects invalid characters', () => {
		expect(() => normalizeShopDomain('acme bad')).toThrow();
	});
});

describe('buildAuthUrl', () => {
	it('includes client id, scopes, redirect_uri, state, and shop domain', () => {
		const url = buildAuthUrl({
			shop: 'acme.myshopify.com',
			origin: 'https://app.example.com',
			state: 'xyz',
			clientId: 'cid',
			scopes: 'read_products,read_inventory'
		});
		expect(url).toContain('https://acme.myshopify.com/admin/oauth/authorize');
		expect(url).toContain('client_id=cid');
		expect(url).toContain('scope=read_products%2Cread_inventory');
		expect(url).toContain(
			'redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Fintegrations%2Fshopify%2Fcallback'
		);
		expect(url).toContain('state=xyz');
	});
});

describe('verifyWebhookHmac', () => {
	it('accepts a correctly signed payload', async () => {
		const secret = 'shhh';
		const body = '{"ok":true}';
		const crypto = await import('node:crypto');
		const sig = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
		expect(verifyWebhookHmac(body, sig, secret)).toBe(true);
	});
	it('rejects a tampered payload', () => {
		expect(verifyWebhookHmac('{"ok":true}', 'bogus', 'shhh')).toBe(false);
	});
	it('rejects a signature of the wrong length (would crash timingSafeEqual)', () => {
		expect(verifyWebhookHmac('{"ok":true}', 'short', 'shhh')).toBe(false);
	});
});

describe('matchVariantBySku', () => {
	it('returns matches keyed by shopify variant id', () => {
		const shopifyVariants = [
			{ id: 'gid://shopify/ProductVariant/1', sku: 'ABC-S' },
			{ id: 'gid://shopify/ProductVariant/2', sku: 'ABC-M' },
			{ id: 'gid://shopify/ProductVariant/3', sku: null }
		];
		const localVariants = [
			{ id: 'uuid-1', sku: 'abc-s' }, // case-insensitive
			{ id: 'uuid-2', sku: 'ABC-M' },
			{ id: 'uuid-3', sku: 'NO-MATCH' }
		];
		const result = matchVariantBySku(shopifyVariants, localVariants);
		expect(result).toEqual({
			'gid://shopify/ProductVariant/1': 'uuid-1',
			'gid://shopify/ProductVariant/2': 'uuid-2'
		});
	});

	it('ignores null or empty SKUs', () => {
		expect(matchVariantBySku([{ id: 'a', sku: '' }], [{ id: 'x', sku: '' }])).toEqual({});
		expect(matchVariantBySku([{ id: 'a', sku: null }], [{ id: 'x', sku: 'X' }])).toEqual({});
	});

	it('trims whitespace on both sides', () => {
		const result = matchVariantBySku([{ id: 'a', sku: '  KEY  ' }], [{ id: 'x', sku: 'key' }]);
		expect(result).toEqual({ a: 'x' });
	});
});
