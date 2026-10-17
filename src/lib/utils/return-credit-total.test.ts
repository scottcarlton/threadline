import { describe, expect, it } from 'vitest';
import { returnCreditTotal } from './return-credit-total.js';

const base = { creditSubtotal: 200, restockingFee: 20, shippingDeduction: 15, creditTax: 16 };

describe('returnCreditTotal', () => {
	it('adds tax under exclusive pricing', () => {
		expect(returnCreditTotal({ ...base, inclusive: false })).toBe(181);
	});

	it('does not add tax under inclusive pricing, where it is already in the prices', () => {
		expect(returnCreditTotal({ ...base, inclusive: true })).toBe(165);
	});

	it('floors at zero when deductions exceed the goods', () => {
		expect(
			returnCreditTotal({
				creditSubtotal: 10,
				restockingFee: 25,
				shippingDeduction: 0,
				creditTax: 0,
				inclusive: false
			})
		).toBe(0);
	});

	it('rounds half away from zero at the cent', () => {
		expect(
			returnCreditTotal({
				creditSubtotal: 2.675,
				restockingFee: 0,
				shippingDeduction: 0,
				creditTax: 0,
				inclusive: false
			})
		).toBe(2.68);
	});
});
