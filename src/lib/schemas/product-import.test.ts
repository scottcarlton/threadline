import { describe, it, expect } from 'vitest';
import { productDraftSchema } from './product-import.js';

const base = { style_number: 'ST-1', name: 'Silk Blouse' };

function priceError(wholesale_price: unknown) {
	const result = productDraftSchema.safeParse({ ...base, wholesale_price });
	return result.success ? null : result.error.issues[0].message;
}

describe('productDraftSchema wholesale_price', () => {
	it('fails a missing or blank price instead of importing it at $0', () => {
		for (const value of [null, undefined, '', '   ']) {
			expect(priceError(value)).toBe('wholesale_price is required');
		}
	});

	it('accepts numbers and numeric strings, including a real $0', () => {
		for (const [value, expected] of [
			[45.5, 45.5],
			['45.5', 45.5],
			[0, 0],
			['0', 0]
		] as const) {
			const result = productDraftSchema.safeParse({ ...base, wholesale_price: value });
			expect(result.success && result.data.wholesale_price).toBe(expected);
		}
	});

	it('rejects text and negative prices', () => {
		expect(priceError('TBD')).toBe('wholesale_price must be a number');
		expect(priceError(-1)).toBe('wholesale_price must be 0 or more');
	});
});
