import { describe, it, expect } from 'vitest';
import { organizationTaxesSchema, salesTaxRateSchema } from './organization-taxes';

describe('organizationTaxesSchema', () => {
	it('accepts a fully-disabled config with default pricingDisplay', () => {
		const result = organizationTaxesSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.pricingDisplay).toBe('exclusive');
			expect(result.data.usSalesTaxEnabled).toBe(false);
			expect(result.data.vatEnabled).toBe(false);
			expect(result.data.gstEnabled).toBe(false);
			expect(result.data.vatRate).toBe('');
			expect(result.data.gstRate).toBe('');
		}
	});

	it('accepts a numeric VAT rate within range', () => {
		const result = organizationTaxesSchema.safeParse({
			pricingDisplay: 'inclusive',
			vatEnabled: true,
			vatRate: 20
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.vatRate).toBe(20);
	});

	it('rejects a VAT rate above 100', () => {
		const result = organizationTaxesSchema.safeParse({ vatRate: 101 });
		expect(result.success).toBe(false);
	});

	it('rejects a negative GST rate', () => {
		const result = organizationTaxesSchema.safeParse({ gstRate: -1 });
		expect(result.success).toBe(false);
	});

	it('coerces a numeric string for VAT rate', () => {
		const result = organizationTaxesSchema.safeParse({ vatRate: '15.5' });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.vatRate).toBe(15.5);
	});
});

describe('salesTaxRateSchema', () => {
	it('uppercases the state code', () => {
		const result = salesTaxRateSchema.safeParse({
			stateCode: 'ca',
			rate: 7.25,
			taxType: 'destination'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.stateCode).toBe('CA');
	});

	it('rejects a non-2-letter state code', () => {
		const result = salesTaxRateSchema.safeParse({
			stateCode: 'CAL',
			rate: 7.25,
			taxType: 'destination'
		});
		expect(result.success).toBe(false);
	});

	it('rejects a rate above 100', () => {
		const result = salesTaxRateSchema.safeParse({
			stateCode: 'CA',
			rate: 150,
			taxType: 'destination'
		});
		expect(result.success).toBe(false);
	});

	it('rejects an unknown tax_type', () => {
		const result = salesTaxRateSchema.safeParse({
			stateCode: 'CA',
			rate: 7.25,
			taxType: 'mixed'
		});
		expect(result.success).toBe(false);
	});

	it('defaults taxType to destination when omitted', () => {
		const result = salesTaxRateSchema.safeParse({
			stateCode: 'CA',
			rate: 7.25
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.taxType).toBe('destination');
	});
});
