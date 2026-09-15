/**
 * What a return is worth, and whether it is allowed at all.
 *
 * Pure. No Supabase client, no database access, no dates read from the ambient
 * clock. Every input is passed in, which is what lets the whole of this file be
 * unit-tested and what keeps the rules in one readable place instead of spread
 * across the create, approve, and issue endpoints.
 *
 * Spec: docs/superpowers/specs/2026-09-14-returns-design.md (SCO-183).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Where the policy comes from
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `20260425000005_org_returns.sql` gave every brand org a return window, a
 * restocking fee, and a buyer-pays-shipping flag, all editable at
 * /organization/returns. Nothing has ever read them. This module is the first
 * consumer, so the shapes here are deliberately a direct mirror of those
 * columns rather than a re-modelling of them.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Why tax is prorated from the invoice and never recomputed
 * ───────────────────────────────────────────────────────────────────────────
 *
 * A credit has to match what was actually charged. `reject_sent_invoice_edits()`
 * freezes an invoice's money columns at send precisely so a later rate change
 * cannot restate an issued document, and a credit computed from today's rates
 * would drift away from the invoice it credits the first time a brand edits its
 * tax settings.
 *
 * The proration reads `invoices.tax_amount` against `invoices.subtotal`, NOT
 * `invoices.tax_breakdown`. The spec originally said breakdown, which is wrong
 * in practice: `send_invoice()` in `20260914000004` sets `subtotal`,
 * `tax_amount`, and `total` and never writes `tax_breakdown`, so it is still
 * `'[]'::jsonb` on every invoice in the system. Prorating from it would return
 * zero tax on every credit. If it is ever populated, it becomes a refinement of
 * this ratio rather than a replacement for it.
 */

/** Mirrors `organizations.returns_restocking_fee_type`. */
export type RestockingFeeType = 'percent' | 'flat';

/**
 * Whether the brand's prices already contain tax. Resolved by
 * `brand_pricing_display()` in `20260914000003`.
 */
export type PricingDisplay = 'inclusive' | 'exclusive';

/** The org's return policy, as stored on `organizations`. */
export interface ReturnPolicy {
	/** `returns_window_days`. Zero disables returns for buyers entirely. */
	windowDays: number;
	restockingFeeType: RestockingFeeType;
	restockingFeeValue: number;
	buyerPaysShipping: boolean;
}

/** One line being returned. Prices are snapshots, not live lookups. */
export interface ReturnCreditLine {
	qty: number;
	unitPrice: number;
}

/**
 * The frozen money on the invoice this return credits.
 *
 * Absent on a free-entry return, and on an order that never reached a sent
 * invoice. Both cases yield zero tax rather than a guess.
 */
export interface SourceInvoiceAmounts {
	subtotal: number;
	taxAmount: number | null;
	pricingDisplay: PricingDisplay;
}

/**
 * Brand overrides, applied before the memo is issued.
 *
 * A goodwill waiver is routine in wholesale. A policy that cannot be waived in
 * the product gets waived outside it, and then the credit memo no longer
 * describes what happened.
 */
export interface ReturnCreditOverrides {
	restockingFee?: number | null;
	shippingDeduction?: number | null;
	creditTax?: number | null;
}

export interface ReturnCreditInput {
	lines: ReturnCreditLine[];
	policy: ReturnPolicy;
	/** Omit for a free-entry return or an order with no sent invoice. */
	sourceInvoice?: SourceInvoiceAmounts | null;
	/** What the return shipment cost. Only deducted when the policy says so. */
	returnShippingCost?: number | null;
	overrides?: ReturnCreditOverrides | null;
}

/** Maps one-to-one onto the money columns of `return_authorizations`. */
export interface ReturnCreditBreakdown {
	creditSubtotal: number;
	restockingFee: number;
	shippingDeduction: number;
	creditTax: number;
	creditTotal: number;
}

/**
 * Coerces the shapes Supabase actually returns. A `NUMERIC` column arrives as a
 * string often enough that every money helper in this repo does this; see
 * `toAmount` in src/lib/utils/order-total.ts.
 */
function toAmount(value: number | string | null | undefined): number {
	if (value == null) return 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Rounds to cents, half away from zero.
 *
 * The epsilon nudge is load-bearing rather than superstition. Binary floating
 * point stores 2.675 as 2.67499999999999982, so `Math.round(2.675 * 100)` is
 * 267 and the credit is a cent short of the invoice it credits. Money lands in
 * `NUMERIC(12,2)`, so the rounding has to be decided here rather than left to
 * whatever Postgres does with the drifted value.
 */
export function roundMoney(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const sign = value < 0 ? -1 : 1;
	const scaled = Math.abs(value) * 100;
	return (sign * Math.round(scaled + 1e-9)) / 100;
}

/** Merchandise value of what is coming back, before any deduction. */
export function returnCreditSubtotal(lines: ReturnCreditLine[]): number {
	const raw = lines.reduce((sum, line) => sum + toAmount(line.qty) * toAmount(line.unitPrice), 0);
	return roundMoney(raw);
}

/**
 * The restocking fee the policy calls for on this subtotal.
 *
 * Capped at the subtotal. A flat $25 fee against a $10 return would otherwise
 * produce a negative credit, which is an invoice, not a credit memo.
 */
export function restockingFeeFor(policy: ReturnPolicy, creditSubtotal: number): number {
	const value = toAmount(policy.restockingFeeValue);
	if (value <= 0) return 0;
	const fee =
		policy.restockingFeeType === 'percent'
			? roundMoney((creditSubtotal * value) / 100)
			: roundMoney(value);
	return Math.min(fee, creditSubtotal);
}

/**
 * Tax on the returned portion, prorated from the frozen invoice.
 *
 * Zero without a source invoice, without tax on it, or against a zero subtotal.
 * Each of those is a real case: free entry, a tax-exempt account, and a fully
 * discounted order respectively.
 */
export function proratedCreditTax(
	sourceInvoice: SourceInvoiceAmounts | null | undefined,
	creditSubtotal: number
): number {
	if (!sourceInvoice) return 0;
	const invoiceSubtotal = toAmount(sourceInvoice.subtotal);
	const invoiceTax = toAmount(sourceInvoice.taxAmount);
	if (invoiceSubtotal <= 0 || invoiceTax <= 0) return 0;

	// Never credit more tax than was charged, even if the return lines somehow
	// exceed the invoice subtotal (a free-entry line added to a derived return
	// can do that).
	const ratio = Math.min(creditSubtotal / invoiceSubtotal, 1);
	return roundMoney(invoiceTax * ratio);
}

/**
 * The full credit breakdown.
 *
 * The total mirrors `send_invoice()` exactly: under inclusive pricing the tax
 * is already inside the line prices, so adding it again would double it; under
 * exclusive pricing it is a separate charge and is credited separately. One
 * expression cannot express both, which is why this branches the same way the
 * invoice does.
 *
 * `creditTax` is still reported under inclusive pricing. It is not added to the
 * total, but the memo needs to state how much of the credit is tax.
 */
export function calculateReturnCredit(input: ReturnCreditInput): ReturnCreditBreakdown {
	const { lines, policy, sourceInvoice, returnShippingCost, overrides } = input;

	const creditSubtotal = returnCreditSubtotal(lines);

	const restockingFee =
		overrides?.restockingFee != null
			? roundMoney(toAmount(overrides.restockingFee))
			: restockingFeeFor(policy, creditSubtotal);

	const shippingDeduction =
		overrides?.shippingDeduction != null
			? roundMoney(toAmount(overrides.shippingDeduction))
			: policy.buyerPaysShipping
				? roundMoney(toAmount(returnShippingCost))
				: 0;

	const creditTax =
		overrides?.creditTax != null
			? roundMoney(toAmount(overrides.creditTax))
			: proratedCreditTax(sourceInvoice, creditSubtotal);

	const inclusive = sourceInvoice?.pricingDisplay === 'inclusive';
	const rawTotal = inclusive
		? creditSubtotal - restockingFee - shippingDeduction
		: creditSubtotal - restockingFee - shippingDeduction + creditTax;

	// Floored at zero. Deductions larger than the goods mean the brand owes
	// nothing, not that the buyer owes the brand; billing for a return is a new
	// invoice and a separate decision.
	const creditTotal = roundMoney(Math.max(rawTotal, 0));

	return { creditSubtotal, restockingFee, shippingDeduction, creditTax, creditTotal };
}

// ───────────────────────────────────────────────────────────────────────────
// Eligibility
// ───────────────────────────────────────────────────────────────────────────

export type ReturnIneligibleReason = 'returns_disabled' | 'not_delivered' | 'window_expired';

export type ReturnEligibility =
	| { eligible: true; daysRemaining: number }
	| { eligible: false; reason: ReturnIneligibleReason };

export interface ReturnEligibilityInput {
	policy: ReturnPolicy;
	/** `orders.delivered_at`, written by /api/orders/[id]/status on delivery. */
	deliveredAt: string | Date | null | undefined;
	/** Passed in rather than read from the clock, so this stays pure. */
	now: Date;
}

/** Whole days between two instants, counted on UTC calendar days. */
function utcDaysBetween(from: Date, to: Date): number {
	const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	return Math.floor((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

/**
 * Whether a buyer may open a return on this order.
 *
 * This is the buyer-facing gate only. A brand is never blocked by its own
 * window: brands waive their policy routinely, and the enforcement point is the
 * request, not the record. Nothing here is called on the brand's own create
 * path.
 *
 * The window is inclusive of its final day. A 30-day window on an order
 * delivered the 1st is still open on the 31st and closed on the 32nd, which is
 * what "you have 30 days" means to the person reading the policy.
 */
export function checkReturnEligibility(input: ReturnEligibilityInput): ReturnEligibility {
	const { policy, deliveredAt, now } = input;

	if (!(policy.windowDays > 0)) return { eligible: false, reason: 'returns_disabled' };

	if (deliveredAt == null) return { eligible: false, reason: 'not_delivered' };
	const delivered = deliveredAt instanceof Date ? deliveredAt : new Date(deliveredAt);
	if (Number.isNaN(delivered.getTime())) return { eligible: false, reason: 'not_delivered' };

	const elapsed = utcDaysBetween(delivered, now);

	// A delivery timestamp in the future is clock skew, not a longer window.
	// Treat it as day zero rather than handing out extra days.
	const used = Math.max(elapsed, 0);
	if (used > policy.windowDays) return { eligible: false, reason: 'window_expired' };

	return { eligible: true, daysRemaining: policy.windowDays - used };
}

// ───────────────────────────────────────────────────────────────────────────
// Line quantity capping
// ───────────────────────────────────────────────────────────────────────────

export interface OrderLineQty {
	orderLineId: string;
	orderedQty: number;
}

/** One prior return against an order line. Passed in, never queried here. */
export interface PriorReturnQty {
	orderLineId: string;
	qty: number;
}

export interface RequestedReturnQty {
	orderLineId: string;
	qty: number;
}

export interface QuantityViolation {
	orderLineId: string;
	requested: number;
	available: number;
}

/**
 * How much of each order line is still returnable.
 *
 * There is deliberately no UNIQUE on `return_authorizations.order_id`: one order
 * can be returned against repeatedly, so "already returned" is a sum across
 * every prior return rather than a single previous one.
 */
export function remainingReturnable(
	orderLines: OrderLineQty[],
	priorReturns: PriorReturnQty[]
): Map<string, number> {
	const returned = new Map<string, number>();
	for (const prior of priorReturns) {
		returned.set(prior.orderLineId, (returned.get(prior.orderLineId) ?? 0) + toAmount(prior.qty));
	}

	const remaining = new Map<string, number>();
	for (const line of orderLines) {
		const available = toAmount(line.orderedQty) - (returned.get(line.orderLineId) ?? 0);
		remaining.set(line.orderLineId, Math.max(available, 0));
	}
	return remaining;
}

/**
 * Which requested quantities exceed what is left.
 *
 * Returns every violation rather than the first, so the UI can mark all the
 * offending rows in one pass instead of making the user resubmit to find the
 * next one.
 *
 * A requested line with no matching order line has zero available. That covers
 * a client posting an `order_line_id` from a different order, which is why this
 * has to run server-side and not only in the picker.
 */
export function validateReturnQuantities(
	requested: RequestedReturnQty[],
	orderLines: OrderLineQty[],
	priorReturns: PriorReturnQty[]
): QuantityViolation[] {
	const remaining = remainingReturnable(orderLines, priorReturns);
	const violations: QuantityViolation[] = [];

	// Two requested rows can point at the same order line, so they are summed
	// before comparing rather than checked independently.
	const requestedByLine = new Map<string, number>();
	for (const row of requested) {
		requestedByLine.set(
			row.orderLineId,
			(requestedByLine.get(row.orderLineId) ?? 0) + toAmount(row.qty)
		);
	}

	for (const [orderLineId, qty] of requestedByLine) {
		const available = remaining.get(orderLineId) ?? 0;
		if (qty > available) violations.push({ orderLineId, requested: qty, available });
	}

	return violations;
}
