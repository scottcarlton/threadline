/**
 * A credit memo's total from its parts.
 *
 * The one TypeScript statement of this rule. calculateReturnCredit() in
 * src/lib/server/returns/credit.ts uses it for the defaults, the return page
 * uses it for the live total as the brand edits the deductions, and
 * issue_credit_memo() (20261016000002) states the same rule in SQL, held to it
 * by tests/rls/credit-memo.test.ts.
 *
 * Under inclusive pricing the tax already sits inside the line prices, so it is
 * reported on the memo but not added; under exclusive it is a separate charge
 * and is credited separately. Same branch as send_invoice(). Floored at zero:
 * deductions larger than the goods mean the brand owes nothing, not that the
 * buyer owes the brand.
 */
export function returnCreditTotal(parts: {
	creditSubtotal: number;
	restockingFee: number;
	shippingDeduction: number;
	creditTax: number;
	inclusive: boolean;
}): number {
	const raw =
		parts.creditSubtotal -
		parts.restockingFee -
		parts.shippingDeduction +
		(parts.inclusive ? 0 : parts.creditTax);
	return roundCents(Math.max(raw, 0));
}

/** Half away from zero at the cent; see roundMoney() in credit.ts for why the nudge. */
function roundCents(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const sign = value < 0 ? -1 : 1;
	return (sign * Math.round(Math.abs(value) * 100 + 1e-9)) / 100;
}
