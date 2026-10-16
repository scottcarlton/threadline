import { describe, expect, it } from 'vitest';
import { taxWasIncluded } from './credit-memo-document.js';

const memo = (total: number, tax = 16) => ({
	credit_subtotal: 200,
	restocking_fee: 20,
	shipping_deduction: 5,
	credit_tax: tax,
	credit_total: total
});

describe('taxWasIncluded', () => {
	it('reads exclusive when the tax was added to the total', () => {
		expect(taxWasIncluded(memo(191))).toBe(false);
	});

	it('reads inclusive when the tax is on the memo but not in the total', () => {
		expect(taxWasIncluded(memo(175))).toBe(true);
	});

	it('reads exclusive when there is no tax at all', () => {
		expect(taxWasIncluded(memo(175, 0))).toBe(false);
	});

	it('reads exclusive for a total floored at zero, where no tax reached the credit either way', () => {
		expect(
			taxWasIncluded({
				credit_subtotal: 10,
				restocking_fee: 25,
				shipping_deduction: 0,
				credit_tax: 1,
				credit_total: 0
			})
		).toBe(false);
	});

	it('copes with NUMERIC columns arriving as strings', () => {
		expect(
			taxWasIncluded({
				credit_subtotal: '200.00',
				restocking_fee: '20.00',
				shipping_deduction: '5.00',
				credit_tax: '16.00',
				credit_total: '175.00'
			})
		).toBe(true);
	});
});
