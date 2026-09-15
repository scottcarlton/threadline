import { describe, it, expect } from 'vitest';
import { orderShippingCost, orderGrandTotal, isShippingEstimate } from './order-total';

describe('orderShippingCost', () => {
	it('returns the cost on file', () => {
		expect(orderShippingCost({ shipping_cost: 25 })).toBe(25);
	});

	it('reads a numeric column that arrives as a string', () => {
		// Postgres `numeric` comes back as a string through PostgREST.
		expect(orderShippingCost({ shipping_cost: '25.50' })).toBe(25.5);
	});

	it('treats null, missing, and zero all as "not quoted yet"', () => {
		expect(orderShippingCost({ shipping_cost: null })).toBeNull();
		expect(orderShippingCost({})).toBeNull();
		expect(orderShippingCost({ shipping_cost: 0 })).toBeNull();
	});

	it('ignores an unparseable value rather than propagating NaN', () => {
		expect(orderShippingCost({ shipping_cost: 'n/a' })).toBeNull();
	});
});

describe('orderGrandTotal', () => {
	it('adds shipping to merchandise', () => {
		expect(orderGrandTotal({ total_amount: 2480, shipping_cost: 25 })).toBe(2505);
	});

	it('falls back to merchandise alone when nothing is quoted', () => {
		expect(orderGrandTotal({ total_amount: 2480, shipping_cost: null })).toBe(2480);
		expect(orderGrandTotal({ total_amount: 2480 })).toBe(2480);
	});

	it('handles string amounts from PostgREST on both columns', () => {
		expect(orderGrandTotal({ total_amount: '2480.00', shipping_cost: '25.00' })).toBe(2505);
	});

	it('never returns NaN', () => {
		expect(orderGrandTotal({ total_amount: null, shipping_cost: undefined })).toBe(0);
	});
});

describe('isShippingEstimate', () => {
	it('is an estimate while the brand is still preparing', () => {
		expect(isShippingEstimate({ shipping_cost: 25, status: 'preparing' })).toBe(true);
	});

	it('is settled once the order ships or is delivered', () => {
		expect(isShippingEstimate({ shipping_cost: 25, status: 'shipped' })).toBe(false);
		expect(isShippingEstimate({ shipping_cost: 25, status: 'delivered' })).toBe(false);
	});

	it('is not an estimate when there is no cost to estimate', () => {
		expect(isShippingEstimate({ shipping_cost: null, status: 'preparing' })).toBe(false);
	});
});
