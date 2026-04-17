import { describe, it, expect } from 'vitest';
import { PRODUCT_UPDATE_FIELDS, buildProductPatch } from './ai-tools.js';

describe('buildProductPatch', () => {
	it('keeps only whitelisted fields', () => {
		const patch = buildProductPatch({
			ats: true,
			wholesale_price: 42,
			category: 'Tops'
		});
		expect(patch).toEqual({ ats: true, wholesale_price: 42, category: 'Tops' });
	});

	it('drops fields not in the whitelist', () => {
		const patch = buildProductPatch({
			ats: true,
			style_number: 'EVIL-001', // not allowed
			name: 'Renamed', // not allowed
			brand_id: 'b-1', // not allowed
			organization_id: 'org-2', // critical: must never be patchable
			id: 'forged-id'
		});
		expect(patch).toEqual({ ats: true });
	});

	it('returns empty patch when no allowed fields are present', () => {
		const patch = buildProductPatch({ name: 'X', style_number: 'Y' });
		expect(patch).toEqual({});
	});

	it('locks the whitelist against accidental dangerous additions', () => {
		// If this test fails, someone added a field — confirm it's safe.
		expect([...PRODUCT_UPDATE_FIELDS]).toEqual([
			'ats',
			'category',
			'wholesale_price',
			'retail_price',
			'product_year',
			'is_active'
		]);
	});
});
