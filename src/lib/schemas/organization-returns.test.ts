import { describe, it, expect } from 'vitest';
import { organizationReturnsSchema } from './organization-returns';

describe('organizationReturnsSchema', () => {
	it('accepts an empty payload with returns disabled defaults', () => {
		const result = organizationReturnsSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.windowDays).toBe(0);
			expect(result.data.useShipFromAddress).toBe(true);
			expect(result.data.restockingFeeType).toBe('percent');
			expect(result.data.restockingFeeValue).toBe(0);
			expect(result.data.buyerPaysShipping).toBe(false);
		}
	});

	it('rejects negative window days', () => {
		const result = organizationReturnsSchema.safeParse({ windowDays: -1 });
		expect(result.success).toBe(false);
	});

	it('rejects fractional window days', () => {
		const result = organizationReturnsSchema.safeParse({ windowDays: 7.5 });
		expect(result.success).toBe(false);
	});

	it('rejects percent fee above 100', () => {
		const result = organizationReturnsSchema.safeParse({
			restockingFeeType: 'percent',
			restockingFeeValue: 101
		});
		expect(result.success).toBe(false);
	});

	it('accepts flat fee above 100', () => {
		const result = organizationReturnsSchema.safeParse({
			restockingFeeType: 'flat',
			restockingFeeValue: 250
		});
		expect(result.success).toBe(true);
	});

	it('rejects negative restocking fee', () => {
		const result = organizationReturnsSchema.safeParse({ restockingFeeValue: -1 });
		expect(result.success).toBe(false);
	});

	it('rejects unknown fee type', () => {
		const result = organizationReturnsSchema.safeParse({ restockingFeeType: 'tiered' });
		expect(result.success).toBe(false);
	});
});
