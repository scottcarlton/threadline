import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_POLICY, toReturnPolicy } from './policy.js';

const row = (over: Record<string, unknown> = {}) =>
	({
		returns_window_days: 30,
		returns_policy_text: 'Thirty days, unworn.',
		returns_use_ship_from_address: true,
		returns_address_line1: null,
		returns_address_line2: null,
		returns_address_city: null,
		returns_address_state: null,
		returns_address_zip: null,
		returns_address_country: null,
		returns_restocking_fee_type: 'percent',
		returns_restocking_fee_value: 10,
		returns_buyer_pays_shipping: false,
		...over
	}) as never;

describe('toReturnPolicy', () => {
	it('maps a populated row', () => {
		const p = toReturnPolicy(row());
		expect(p.windowDays).toBe(30);
		expect(p.restockingFeeType).toBe('percent');
		expect(p.restockingFeeValue).toBe(10);
		expect(p.buyerPaysShipping).toBe(false);
		expect(p.policyText).toBe('Thirty days, unworn.');
	});

	it('falls back to returns-off when the org row is missing', () => {
		// A missing row must not read as "returns enabled with no window".
		expect(toReturnPolicy(null)).toEqual(DEFAULT_RETURN_POLICY);
		expect(toReturnPolicy(null).windowDays).toBe(0);
	});

	it('treats null columns as the column defaults', () => {
		const p = toReturnPolicy(
			row({
				returns_window_days: null,
				returns_restocking_fee_value: null,
				returns_buyer_pays_shipping: null,
				returns_use_ship_from_address: null
			})
		);
		expect(p.windowDays).toBe(0);
		expect(p.restockingFeeValue).toBe(0);
		expect(p.buyerPaysShipping).toBe(false);
		expect(p.useShipFromAddress).toBe(true);
	});

	it('coerces the NUMERIC fee, which Supabase returns as a string', () => {
		expect(toReturnPolicy(row({ returns_restocking_fee_value: '12.50' })).restockingFeeValue).toBe(
			12.5
		);
	});

	it('falls back to zero on an unparseable fee rather than NaN', () => {
		// NaN would propagate silently through the whole credit calculation.
		expect(toReturnPolicy(row({ returns_restocking_fee_value: 'oops' })).restockingFeeValue).toBe(
			0
		);
	});

	it('accepts flat and normalizes anything else to percent', () => {
		expect(toReturnPolicy(row({ returns_restocking_fee_type: 'flat' })).restockingFeeType).toBe(
			'flat'
		);
		expect(toReturnPolicy(row({ returns_restocking_fee_type: null })).restockingFeeType).toBe(
			'percent'
		);
		expect(toReturnPolicy(row({ returns_restocking_fee_type: 'weird' })).restockingFeeType).toBe(
			'percent'
		);
	});

	it('carries the return address through', () => {
		const p = toReturnPolicy(
			row({
				returns_use_ship_from_address: false,
				returns_address_line1: '1 Return Way',
				returns_address_city: 'Denver',
				returns_address_state: 'CO'
			})
		);
		expect(p.useShipFromAddress).toBe(false);
		expect(p.returnAddress.line1).toBe('1 Return Way');
		expect(p.returnAddress.city).toBe('Denver');
	});
});
