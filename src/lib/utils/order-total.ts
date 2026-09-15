/**
 * An order carries two different numbers and they are not interchangeable.
 *
 * `orders.total_amount` is merchandise only: the DB sums `order_lines.line_total`
 * into it via the `recalc_order_total` trigger. That is the number revenue,
 * commission, and every analytics rollup want: reps are paid on goods sold, not
 * on freight, and shipping is a pass-through cost rather than sales.
 *
 * The *payable* total is merchandise plus shipping plus tax. That is what a
 * person means when they look at an order and ask what it costs, so it is what
 * the order detail rail, the /orders list, the order PDF, and the order emails
 * all show.
 *
 * Tax is part of the payable figure and deliberately NOT part of
 * `total_amount`: folding it into the merchandise column would inflate every
 * rep's commission by the tax rate. `orders.tax_amount` is maintained by
 * `recalc_order_tax()` and is an estimate until the invoice freezes it.
 *
 * Keep the split. If you find yourself reaching for `orderGrandTotal` inside a
 * revenue or commission calculation, you want `total_amount` instead.
 */

type OrderAmounts = {
	total_amount?: number | string | null;
	shipping_cost?: number | string | null;
	tax_amount?: number | string | null;
};

function toAmount(value: number | string | null | undefined): number {
	if (value == null) return 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Shipping on file for this order, or null when there is none yet.
 *
 * Normalizes both "column is null" and "column is zero" to null. A $0 shipping
 * cost is how the column reads before the brand quotes anything, so treating it
 * as a real value would print "$0.00" on orders nobody has priced.
 */
export function orderShippingCost(order: OrderAmounts): number | null {
	const cost = toAmount(order.shipping_cost);
	return cost > 0 ? cost : null;
}

/**
 * Tax on file for this order, or null when it cannot be determined yet.
 *
 * Null and zero mean different things and must not be collapsed. Null is
 * "there is no ship-to address to resolve a rate against", which is why a
 * surface renders it as "calculated at invoicing". Zero is a settled answer:
 * this brand charges no tax on this sale.
 */
export function orderTaxAmount(order: OrderAmounts): number | null {
	if (order.tax_amount === null || order.tax_amount === undefined) return null;
	const n = Number(order.tax_amount);
	return Number.isFinite(n) ? n : null;
}

/** Merchandise plus shipping plus tax: what the order is actually worth to the buyer. */
export function orderGrandTotal(order: OrderAmounts): number {
	return (
		toAmount(order.total_amount) + (orderShippingCost(order) ?? 0) + (orderTaxAmount(order) ?? 0)
	);
}

/**
 * Whether the shipping on file is still a quote rather than a settled charge.
 *
 * The brand enters a cost when it moves the order to `preparing` and can revise
 * it at `shipped`. Until the order actually ships the number is an estimate and
 * every surface that prints it should say so.
 */
export function isShippingEstimate(order: OrderAmounts & { status?: string | null }): boolean {
	if (orderShippingCost(order) === null) return false;
	return order.status !== 'shipped' && order.status !== 'delivered';
}

/**
 * Whether the tax on file is still an estimate rather than a settled charge.
 *
 * It always is, on an order. `recalc_order_tax()` recomputes on every write and
 * the figure is only frozen when the invoice is sent, so any non-zero tax shown
 * against an order should say so.
 */
export function isTaxEstimate(order: OrderAmounts): boolean {
	const tax = orderTaxAmount(order);
	return tax !== null && tax > 0;
}
