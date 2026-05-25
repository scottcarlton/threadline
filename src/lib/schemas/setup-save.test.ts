import { describe, it, expect } from 'vitest';
import { setupSaveSchema, setupGatewaySchema } from './setup-save.js';

describe('setupSaveSchema', () => {
	it('validates address with structured fields', () => {
		const result = setupSaveSchema.safeParse({
			step: 'address',
			value: { line1: '123 Main St', city: 'New York', state: 'NY', zip: '10001' }
		});
		expect(result.success).toBe(true);
	});

	it('rejects address missing required fields', () => {
		const result = setupSaveSchema.safeParse({
			step: 'address',
			value: { line1: '', city: '', state: '', zip: '' }
		});
		expect(result.success).toBe(false);
	});

	it('defaults country to US', () => {
		const result = setupSaveSchema.safeParse({
			step: 'address',
			value: { line1: '123 Main', city: 'LA', state: 'CA', zip: '90001' }
		});
		expect(result.success).toBe(true);
		if (result.success && result.data.step === 'address') {
			expect(result.data.value.country).toBe('US');
		}
	});

	it('validates ship-from yes/skip', () => {
		expect(setupSaveSchema.safeParse({ step: 'ship-from', value: 'yes' }).success).toBe(true);
		expect(setupSaveSchema.safeParse({ step: 'ship-from', value: 'skip' }).success).toBe(true);
		expect(setupSaveSchema.safeParse({ step: 'ship-from', value: 'maybe' }).success).toBe(false);
	});

	it('validates shipping-default requires UUID or skip', () => {
		expect(setupSaveSchema.safeParse({ step: 'shipping-default', value: 'skip' }).success).toBe(
			true
		);
		expect(
			setupSaveSchema.safeParse({
				step: 'shipping-default',
				value: '550e8400-e29b-41d4-a716-446655440000'
			}).success
		).toBe(true);
		expect(setupSaveSchema.safeParse({ step: 'shipping-default', value: 'Ground' }).success).toBe(
			false
		);
	});

	it('validates payment methods array', () => {
		const result = setupSaveSchema.safeParse({
			step: 'payment-methods',
			value: ['credit_card', 'ach']
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid payment method', () => {
		const result = setupSaveSchema.safeParse({
			step: 'payment-methods',
			value: ['bitcoin']
		});
		expect(result.success).toBe(false);
	});

	it('validates payment terms enum', () => {
		expect(setupSaveSchema.safeParse({ step: 'payment-terms', value: 'net_30' }).success).toBe(
			true
		);
		expect(setupSaveSchema.safeParse({ step: 'payment-terms', value: 'net_999' }).success).toBe(
			false
		);
	});

	it('validates product-manual with required fields', () => {
		const result = setupSaveSchema.safeParse({
			step: 'product-manual',
			value: {
				styleNumber: 'ST-001',
				name: 'Classic Tee',
				wholesalePrice: 24.5
			}
		});
		expect(result.success).toBe(true);
	});

	it('rejects product-manual missing name', () => {
		const result = setupSaveSchema.safeParse({
			step: 'product-manual',
			value: {
				styleNumber: 'ST-001',
				name: '',
				wholesalePrice: 24.5
			}
		});
		expect(result.success).toBe(false);
	});

	it('validates account-manual with required fields', () => {
		const result = setupSaveSchema.safeParse({
			step: 'account-manual',
			value: { businessName: 'Nordstrom' }
		});
		expect(result.success).toBe(true);
	});

	it('rejects account-manual with empty business name', () => {
		const result = setupSaveSchema.safeParse({
			step: 'account-manual',
			value: { businessName: '' }
		});
		expect(result.success).toBe(false);
	});
});

describe('setupGatewaySchema', () => {
	it('validates orders/taxes/returns with yes/skip', () => {
		expect(setupGatewaySchema.safeParse({ step: 'orders', value: 'yes' }).success).toBe(true);
		expect(setupGatewaySchema.safeParse({ step: 'taxes', value: 'skip' }).success).toBe(true);
		expect(setupGatewaySchema.safeParse({ step: 'returns', value: 'skip' }).success).toBe(true);
	});

	it('rejects unknown step', () => {
		expect(setupGatewaySchema.safeParse({ step: 'billing', value: 'skip' }).success).toBe(false);
	});
});
