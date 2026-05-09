import { describe, it, expect } from 'vitest';
import { organizationShippingSchema, shippingMethodSchema } from './organization-shipping';

describe('organizationShippingSchema', () => {
	it('accepts an empty payload with defaults', () => {
		const result = organizationShippingSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.useBusinessAddress).toBe(true);
			expect(result.data.freeThresholdEnabled).toBe(false);
			expect(result.data.freeThresholdAmount).toBe(0);
		}
	});

	it('rejects free-shipping enabled with zero threshold', () => {
		const result = organizationShippingSchema.safeParse({
			freeThresholdEnabled: true,
			freeThresholdAmount: 0
		});
		expect(result.success).toBe(false);
	});

	it('accepts free-shipping enabled with positive threshold', () => {
		const result = organizationShippingSchema.safeParse({
			freeThresholdEnabled: true,
			freeThresholdAmount: 250
		});
		expect(result.success).toBe(true);
	});

	it('coerces threshold from numeric string', () => {
		const result = organizationShippingSchema.safeParse({ freeThresholdAmount: '199.99' });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.freeThresholdAmount).toBe(199.99);
	});
});

describe('shippingMethodSchema', () => {
	it('requires a name', () => {
		const result = shippingMethodSchema.safeParse({
			name: '',
			costType: 'flat',
			costAmount: 10
		});
		expect(result.success).toBe(false);
	});

	it('requires costAmount when costType is flat', () => {
		const result = shippingMethodSchema.safeParse({
			name: 'Ground',
			costType: 'flat',
			costAmount: ''
		});
		expect(result.success).toBe(false);
	});

	it('accepts free with empty cost', () => {
		const result = shippingMethodSchema.safeParse({
			name: 'Free shipping',
			costType: 'free',
			costAmount: ''
		});
		expect(result.success).toBe(true);
	});

	it('accepts calculated with empty cost', () => {
		const result = shippingMethodSchema.safeParse({
			name: 'Calculated',
			costType: 'calculated',
			costAmount: ''
		});
		expect(result.success).toBe(true);
	});

	it('rejects unknown cost_type', () => {
		const result = shippingMethodSchema.safeParse({
			name: 'X',
			costType: 'sliding',
			costAmount: 10
		});
		expect(result.success).toBe(false);
	});

	it('coerces costAmount from numeric string', () => {
		const result = shippingMethodSchema.safeParse({
			name: 'Ground',
			costType: 'flat',
			costAmount: '15.50'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.costAmount).toBe(15.5);
	});
});
