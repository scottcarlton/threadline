import { describe, it, expect } from 'vitest';
import { createProductSchema } from './product';

function validBase() {
	return {
		name: 'Linen Shirt',
		styleNumber: 'VR-2001',
		wholesalePrice: 92,
		sizes: ['S', 'M', 'L'],
		hasVariants: false,
		variants: []
	};
}

describe('createProductSchema', () => {
	it('passes with valid base fields', () => {
		const result = createProductSchema.safeParse(validBase());
		expect(result.success).toBe(true);
	});

	it('rejects missing name', () => {
		const result = createProductSchema.safeParse({ ...validBase(), name: '' });
		expect(result.success).toBe(false);
	});

	it('rejects missing style number', () => {
		const result = createProductSchema.safeParse({ ...validBase(), styleNumber: '' });
		expect(result.success).toBe(false);
	});

	it('rejects empty sizes array', () => {
		const result = createProductSchema.safeParse({ ...validBase(), sizes: [] });
		expect(result.success).toBe(false);
	});

	it('rejects hasVariants=true with no variants', () => {
		const result = createProductSchema.safeParse({
			...validBase(),
			hasVariants: true,
			variants: []
		});
		expect(result.success).toBe(false);
	});

	it('rejects hasVariants=true with no primary variant', () => {
		const result = createProductSchema.safeParse({
			...validBase(),
			hasVariants: true,
			variants: [
				{
					id: 'abc',
					colorName: 'Camel',
					colorHex: '#c69b6d',
					isPrimary: false,
					inventory: {},
					stockThreshold: null
				}
			]
		});
		expect(result.success).toBe(false);
	});

	it('passes hasVariants=true with a primary variant', () => {
		const result = createProductSchema.safeParse({
			...validBase(),
			hasVariants: true,
			variants: [
				{
					id: 'abc',
					colorName: 'Camel',
					colorHex: '#c69b6d',
					isPrimary: true,
					inventory: {},
					stockThreshold: null
				}
			]
		});
		expect(result.success).toBe(true);
	});

	it('coerces wholesalePrice from string', () => {
		const result = createProductSchema.safeParse({
			...validBase(),
			wholesalePrice: '92.50'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.wholesalePrice).toBe(92.5);
		}
	});

	it('defaults optional fields', () => {
		const result = createProductSchema.safeParse(validBase());
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.ats).toBe(false);
			expect(result.data.featured).toBe(false);
			expect(result.data.sizeMode).toBe('letter');
			expect(result.data.description).toBe('');
		}
	});
});
