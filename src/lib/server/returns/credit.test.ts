import { describe, expect, it } from 'vitest';
import {
	calculateReturnCredit,
	checkReturnEligibility,
	proratedCreditTax,
	remainingReturnable,
	restockingFeeFor,
	returnCreditSubtotal,
	roundMoney,
	validateReturnQuantities,
	type ReturnCreditLine,
	type ReturnPolicy,
	type SourceInvoiceAmounts
} from './credit.js';

const policy = (over: Partial<ReturnPolicy> = {}): ReturnPolicy => ({
	windowDays: 30,
	restockingFeeType: 'percent',
	restockingFeeValue: 0,
	buyerPaysShipping: false,
	...over
});

const invoice = (over: Partial<SourceInvoiceAmounts> = {}): SourceInvoiceAmounts => ({
	subtotal: 1000,
	taxAmount: 80,
	pricingDisplay: 'exclusive',
	...over
});

describe('roundMoney', () => {
	// These are the values that break the naive Math.round(n * 100) / 100, and
	// they are pinned rather than assumed: a cent of drift makes a credit memo
	// disagree with the invoice it credits.
	it('rounds half away from zero despite binary representation error', () => {
		expect(roundMoney(2.675)).toBe(2.68);
		expect(roundMoney(1.005)).toBe(1.01);
		expect(roundMoney(0.145)).toBe(0.15);
		expect(roundMoney(8.165)).toBe(8.17);
	});

	it('leaves exact cents alone', () => {
		expect(roundMoney(10)).toBe(10);
		expect(roundMoney(10.5)).toBe(10.5);
		expect(roundMoney(0)).toBe(0);
	});

	it('is defensive about non-finite input', () => {
		expect(roundMoney(Number.NaN)).toBe(0);
		expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
	});
});

describe('returnCreditSubtotal', () => {
	it('sums qty times unit price', () => {
		expect(returnCreditSubtotal([{ qty: 3, unitPrice: 100 }])).toBe(300);
		expect(
			returnCreditSubtotal([
				{ qty: 2, unitPrice: 49.99 },
				{ qty: 1, unitPrice: 10.01 }
			])
		).toBe(109.99);
	});

	it('is zero for no lines', () => {
		expect(returnCreditSubtotal([])).toBe(0);
	});

	it('accepts the strings Supabase returns for NUMERIC columns', () => {
		const fromDb = [{ qty: '2', unitPrice: '12.50' }] as unknown as ReturnCreditLine[];
		expect(returnCreditSubtotal(fromDb)).toBe(25);
	});

	it('rounds the sum to cents', () => {
		// 3 x 33.335 = 100.005, which must land on a cent.
		expect(returnCreditSubtotal([{ qty: 3, unitPrice: 33.335 }])).toBe(100.01);
	});
});

describe('restockingFeeFor', () => {
	it('takes a percent of the subtotal', () => {
		expect(
			restockingFeeFor(policy({ restockingFeeType: 'percent', restockingFeeValue: 10 }), 300)
		).toBe(30);
	});

	it('rounds a percent to cents', () => {
		// 15% of 33.37 is 5.0055.
		expect(
			restockingFeeFor(policy({ restockingFeeType: 'percent', restockingFeeValue: 15 }), 33.37)
		).toBe(5.01);
	});

	it('takes a flat amount', () => {
		expect(
			restockingFeeFor(policy({ restockingFeeType: 'flat', restockingFeeValue: 25 }), 300)
		).toBe(25);
	});

	it('is zero when the policy sets no fee', () => {
		expect(restockingFeeFor(policy({ restockingFeeValue: 0 }), 300)).toBe(0);
	});

	it('caps a flat fee at the subtotal so the credit cannot go negative', () => {
		expect(
			restockingFeeFor(policy({ restockingFeeType: 'flat', restockingFeeValue: 25 }), 10)
		).toBe(10);
	});

	it('caps a percent above 100 at the subtotal', () => {
		expect(
			restockingFeeFor(policy({ restockingFeeType: 'percent', restockingFeeValue: 150 }), 300)
		).toBe(300);
	});
});

describe('proratedCreditTax', () => {
	it('prorates the invoice tax by the returned share of the subtotal', () => {
		// Returning 300 of a 1000 subtotal that carried 80 tax.
		expect(proratedCreditTax(invoice(), 300)).toBe(24);
	});

	it('credits the whole tax on a full return', () => {
		expect(proratedCreditTax(invoice(), 1000)).toBe(80);
	});

	it('never credits more tax than was charged', () => {
		// Free-entry lines can push a derived return past the invoice subtotal.
		expect(proratedCreditTax(invoice(), 5000)).toBe(80);
	});

	it('is zero with no source invoice, which is the free-entry case', () => {
		expect(proratedCreditTax(null, 300)).toBe(0);
		expect(proratedCreditTax(undefined, 300)).toBe(0);
	});

	it('is zero when the invoice carried no tax', () => {
		expect(proratedCreditTax(invoice({ taxAmount: null }), 300)).toBe(0);
		expect(proratedCreditTax(invoice({ taxAmount: 0 }), 300)).toBe(0);
	});

	it('is zero against a zero invoice subtotal rather than dividing by zero', () => {
		expect(proratedCreditTax(invoice({ subtotal: 0 }), 300)).toBe(0);
	});

	it('rounds the prorated share to cents', () => {
		// A third of 10.00 tax.
		expect(proratedCreditTax(invoice({ subtotal: 300, taxAmount: 10 }), 100)).toBe(3.33);
	});
});

describe('calculateReturnCredit', () => {
	const lines = [{ qty: 3, unitPrice: 100 }];

	it('credits the full subtotal when the policy deducts nothing', () => {
		const result = calculateReturnCredit({ lines, policy: policy() });
		expect(result).toEqual({
			creditSubtotal: 300,
			restockingFee: 0,
			shippingDeduction: 0,
			creditTax: 0,
			creditTotal: 300
		});
	});

	it('deducts a percent restocking fee', () => {
		const result = calculateReturnCredit({
			lines,
			policy: policy({ restockingFeeType: 'percent', restockingFeeValue: 10 })
		});
		expect(result.restockingFee).toBe(30);
		expect(result.creditTotal).toBe(270);
	});

	it('deducts a flat restocking fee', () => {
		const result = calculateReturnCredit({
			lines,
			policy: policy({ restockingFeeType: 'flat', restockingFeeValue: 25 })
		});
		expect(result.restockingFee).toBe(25);
		expect(result.creditTotal).toBe(275);
	});

	it('deducts return shipping only when the policy says the buyer pays it', () => {
		const on = calculateReturnCredit({
			lines,
			policy: policy({ buyerPaysShipping: true }),
			returnShippingCost: 18.5
		});
		expect(on.shippingDeduction).toBe(18.5);
		expect(on.creditTotal).toBe(281.5);

		const off = calculateReturnCredit({
			lines,
			policy: policy({ buyerPaysShipping: false }),
			returnShippingCost: 18.5
		});
		expect(off.shippingDeduction).toBe(0);
		expect(off.creditTotal).toBe(300);
	});

	it('deducts nothing for shipping when the policy says so but no cost is known', () => {
		const result = calculateReturnCredit({
			lines,
			policy: policy({ buyerPaysShipping: true }),
			returnShippingCost: null
		});
		expect(result.shippingDeduction).toBe(0);
	});

	it('adds prorated tax under exclusive pricing', () => {
		const result = calculateReturnCredit({
			lines,
			policy: policy(),
			sourceInvoice: invoice({ pricingDisplay: 'exclusive' })
		});
		expect(result.creditTax).toBe(24);
		expect(result.creditTotal).toBe(324);
	});

	it('reports but does not add tax under inclusive pricing', () => {
		// Mirrors send_invoice(): under inclusive pricing the tax is already
		// inside the line prices, so adding it again would credit it twice.
		const result = calculateReturnCredit({
			lines,
			policy: policy(),
			sourceInvoice: invoice({ pricingDisplay: 'inclusive' })
		});
		expect(result.creditTax).toBe(24);
		expect(result.creditTotal).toBe(300);
	});

	it('combines every deduction with tax', () => {
		const result = calculateReturnCredit({
			lines,
			policy: policy({
				restockingFeeType: 'percent',
				restockingFeeValue: 10,
				buyerPaysShipping: true
			}),
			returnShippingCost: 20,
			sourceInvoice: invoice()
		});
		// 300 - 30 - 20 + 24
		expect(result.creditTotal).toBe(274);
	});

	it('is zero credit on a free-entry return with no lines', () => {
		const result = calculateReturnCredit({ lines: [], policy: policy() });
		expect(result.creditSubtotal).toBe(0);
		expect(result.creditTotal).toBe(0);
	});

	it('credits merchandise with no tax when there is no source invoice', () => {
		const result = calculateReturnCredit({ lines, policy: policy(), sourceInvoice: null });
		expect(result.creditTax).toBe(0);
		expect(result.creditTotal).toBe(300);
	});

	describe('overrides', () => {
		it('overrides the restocking fee, including down to zero as a waiver', () => {
			const waived = calculateReturnCredit({
				lines,
				policy: policy({ restockingFeeType: 'percent', restockingFeeValue: 10 }),
				overrides: { restockingFee: 0 }
			});
			expect(waived.restockingFee).toBe(0);
			expect(waived.creditTotal).toBe(300);
		});

		it('overrides the shipping deduction', () => {
			const result = calculateReturnCredit({
				lines,
				policy: policy({ buyerPaysShipping: true }),
				returnShippingCost: 20,
				overrides: { shippingDeduction: 5 }
			});
			expect(result.shippingDeduction).toBe(5);
			expect(result.creditTotal).toBe(295);
		});

		it('overrides tax, which is how free entry gets tax at all', () => {
			const result = calculateReturnCredit({
				lines,
				policy: policy(),
				sourceInvoice: null,
				overrides: { creditTax: 12.5 }
			});
			expect(result.creditTax).toBe(12.5);
			expect(result.creditTotal).toBe(312.5);
		});

		it('treats null as absent and falls back to the policy', () => {
			const result = calculateReturnCredit({
				lines,
				policy: policy({ restockingFeeType: 'percent', restockingFeeValue: 10 }),
				overrides: { restockingFee: null }
			});
			expect(result.restockingFee).toBe(30);
		});
	});

	it('floors the credit at zero rather than billing the buyer', () => {
		const result = calculateReturnCredit({
			lines: [{ qty: 1, unitPrice: 10 }],
			policy: policy({ buyerPaysShipping: true }),
			returnShippingCost: 40,
			overrides: { restockingFee: 5 }
		});
		expect(result.creditTotal).toBe(0);
	});
});

describe('checkReturnEligibility', () => {
	const delivered = '2026-09-01T12:00:00Z';
	const at = (iso: string) => new Date(iso);

	it('is disabled when the window is zero', () => {
		expect(
			checkReturnEligibility({
				policy: policy({ windowDays: 0 }),
				deliveredAt: delivered,
				now: at('2026-09-02T00:00:00Z')
			})
		).toEqual({ eligible: false, reason: 'returns_disabled' });
	});

	it('is not eligible before delivery', () => {
		expect(
			checkReturnEligibility({
				policy: policy(),
				deliveredAt: null,
				now: at('2026-09-02T00:00:00Z')
			})
		).toEqual({ eligible: false, reason: 'not_delivered' });
	});

	it('treats an unparseable delivery timestamp as not delivered', () => {
		expect(
			checkReturnEligibility({
				policy: policy(),
				deliveredAt: 'not a date',
				now: at('2026-09-02T00:00:00Z')
			})
		).toEqual({ eligible: false, reason: 'not_delivered' });
	});

	it('is eligible inside the window', () => {
		expect(
			checkReturnEligibility({
				policy: policy({ windowDays: 30 }),
				deliveredAt: delivered,
				now: at('2026-09-10T00:00:00Z')
			})
		).toEqual({ eligible: true, daysRemaining: 21 });
	});

	it('is eligible on the delivery day itself', () => {
		expect(
			checkReturnEligibility({
				policy: policy({ windowDays: 30 }),
				deliveredAt: delivered,
				now: at('2026-09-01T23:59:00Z')
			})
		).toEqual({ eligible: true, daysRemaining: 30 });
	});

	it('is eligible on the final day of the window', () => {
		// A 30-day window on an order delivered the 1st is still open on the 31st.
		expect(
			checkReturnEligibility({
				policy: policy({ windowDays: 30 }),
				deliveredAt: delivered,
				now: at('2026-10-01T23:00:00Z')
			})
		).toEqual({ eligible: true, daysRemaining: 0 });
	});

	it('expires the day after the window closes', () => {
		expect(
			checkReturnEligibility({
				policy: policy({ windowDays: 30 }),
				deliveredAt: delivered,
				now: at('2026-10-02T00:01:00Z')
			})
		).toEqual({ eligible: false, reason: 'window_expired' });
	});

	it('does not hand out extra days when the delivery timestamp is in the future', () => {
		// Clock skew, not a longer window.
		expect(
			checkReturnEligibility({
				policy: policy({ windowDays: 30 }),
				deliveredAt: '2026-09-10T00:00:00Z',
				now: at('2026-09-01T00:00:00Z')
			})
		).toEqual({ eligible: true, daysRemaining: 30 });
	});

	it('accepts a Date as well as a string', () => {
		expect(
			checkReturnEligibility({
				policy: policy({ windowDays: 5 }),
				deliveredAt: new Date(delivered),
				now: at('2026-09-03T00:00:00Z')
			})
		).toEqual({ eligible: true, daysRemaining: 3 });
	});
});

describe('remainingReturnable', () => {
	const orderLines = [
		{ orderLineId: 'a', orderedQty: 10 },
		{ orderLineId: 'b', orderedQty: 4 }
	];

	it('is the full ordered qty with no prior returns', () => {
		const remaining = remainingReturnable(orderLines, []);
		expect(remaining.get('a')).toBe(10);
		expect(remaining.get('b')).toBe(4);
	});

	it('subtracts a single prior return', () => {
		const remaining = remainingReturnable(orderLines, [{ orderLineId: 'a', qty: 3 }]);
		expect(remaining.get('a')).toBe(7);
	});

	it('subtracts the sum of multiple prior returns', () => {
		// One order can be returned against repeatedly; there is no UNIQUE on
		// return_authorizations.order_id.
		const remaining = remainingReturnable(orderLines, [
			{ orderLineId: 'a', qty: 3 },
			{ orderLineId: 'a', qty: 2 },
			{ orderLineId: 'b', qty: 1 }
		]);
		expect(remaining.get('a')).toBe(5);
		expect(remaining.get('b')).toBe(3);
	});

	it('is zero for a fully returned line', () => {
		const remaining = remainingReturnable(orderLines, [{ orderLineId: 'a', qty: 10 }]);
		expect(remaining.get('a')).toBe(0);
	});

	it('never goes negative if prior returns somehow exceed the order', () => {
		const remaining = remainingReturnable(orderLines, [{ orderLineId: 'a', qty: 99 }]);
		expect(remaining.get('a')).toBe(0);
	});
});

describe('validateReturnQuantities', () => {
	const orderLines = [
		{ orderLineId: 'a', orderedQty: 10 },
		{ orderLineId: 'b', orderedQty: 4 }
	];

	it('passes a request inside the remaining quantity', () => {
		expect(validateReturnQuantities([{ orderLineId: 'a', qty: 5 }], orderLines, [])).toEqual([]);
	});

	it('passes a request for exactly what is left', () => {
		expect(
			validateReturnQuantities([{ orderLineId: 'a', qty: 7 }], orderLines, [
				{ orderLineId: 'a', qty: 3 }
			])
		).toEqual([]);
	});

	it('flags a request beyond the remaining quantity', () => {
		expect(
			validateReturnQuantities([{ orderLineId: 'a', qty: 8 }], orderLines, [
				{ orderLineId: 'a', qty: 3 }
			])
		).toEqual([{ orderLineId: 'a', requested: 8, available: 7 }]);
	});

	it('flags a fully returned line', () => {
		expect(
			validateReturnQuantities([{ orderLineId: 'a', qty: 1 }], orderLines, [
				{ orderLineId: 'a', qty: 10 }
			])
		).toEqual([{ orderLineId: 'a', requested: 1, available: 0 }]);
	});

	it('reports every violation rather than stopping at the first', () => {
		const violations = validateReturnQuantities(
			[
				{ orderLineId: 'a', qty: 99 },
				{ orderLineId: 'b', qty: 99 }
			],
			orderLines,
			[]
		);
		expect(violations).toHaveLength(2);
	});

	it('sums two requested rows pointing at the same order line', () => {
		// Splitting one line across two rows must not double the allowance.
		expect(
			validateReturnQuantities(
				[
					{ orderLineId: 'b', qty: 3 },
					{ orderLineId: 'b', qty: 3 }
				],
				orderLines,
				[]
			)
		).toEqual([{ orderLineId: 'b', requested: 6, available: 4 }]);
	});

	it('treats an unknown order line as having nothing available', () => {
		// A client posting an order_line_id from a different order. This is why
		// the check cannot live only in the picker.
		expect(
			validateReturnQuantities([{ orderLineId: 'elsewhere', qty: 1 }], orderLines, [])
		).toEqual([{ orderLineId: 'elsewhere', requested: 1, available: 0 }]);
	});
});
