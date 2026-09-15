import { describe, it, expect } from 'vitest';
import {
	isShippingEstimate,
	isTaxEstimate,
	orderGrandTotal,
	orderShippingCost,
	orderTaxAmount
} from './order-total.js';

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

describe('orderTaxAmount', () => {
	it('returns the figure on file', () => {
		expect(orderTaxAmount({ tax_amount: 85 })).toBe(85);
	});

	it('distinguishes null from zero', () => {
		// Null means no ship-to to resolve a rate against; zero means this brand
		// charges no tax on this sale. Collapsing them would turn "we do not know
		// yet" into a claim that nothing is owed.
		expect(orderTaxAmount({ tax_amount: null })).toBeNull();
		expect(orderTaxAmount({})).toBeNull();
		expect(orderTaxAmount({ tax_amount: 0 })).toBe(0);
	});

	it('handles the numeric strings PostgREST returns', () => {
		expect(orderTaxAmount({ tax_amount: '85.50' })).toBe(85.5);
	});
});

describe('orderGrandTotal with tax', () => {
	it('adds tax to merchandise and shipping', () => {
		expect(orderGrandTotal({ total_amount: 1000, shipping_cost: 50, tax_amount: 85 })).toBe(1135);
	});

	it('treats missing tax as zero', () => {
		expect(orderGrandTotal({ total_amount: 1000, shipping_cost: 50 })).toBe(1050);
		expect(orderGrandTotal({ total_amount: 1000, shipping_cost: 50, tax_amount: null })).toBe(1050);
	});

	it('never touches total_amount, which feeds commission', () => {
		// The split this module exists to protect: the payable figure moves with
		// tax, the merchandise figure does not.
		const order = { total_amount: 1000, shipping_cost: 50, tax_amount: 85 };
		expect(orderGrandTotal(order)).toBe(1135);
		expect(Number(order.total_amount)).toBe(1000);
	});
});

describe('isTaxEstimate', () => {
	it('is true whenever tax is charged, because an order figure is never frozen', () => {
		expect(isTaxEstimate({ tax_amount: 85 })).toBe(true);
	});

	it('is false when there is no tax to qualify', () => {
		expect(isTaxEstimate({ tax_amount: 0 })).toBe(false);
		expect(isTaxEstimate({ tax_amount: null })).toBe(false);
	});
});
