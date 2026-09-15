/**
 * An order carries two different numbers and they are not interchangeable.
 *
 * `orders.total_amount` is merchandise only: the DB sums `order_lines.line_total`
 * into it via the `recalc_order_total` trigger. That is the number revenue,
 * commission, and every analytics rollup want: reps are paid on goods sold, not
 * on freight, and shipping is a pass-through cost rather than sales.
 *
 * The *payable* total is merchandise plus shipping. That is what a person means
 * when they look at an order and ask what it costs, so it is what the order
 * detail rail, the /orders list, the order PDF, and the order emails all show.
 *
 * Keep the split. If you find yourself reaching for `orderGrandTotal` inside a
 * revenue or commission calculation, you want `total_amount` instead.
 */

type OrderAmounts = {
	total_amount?: number | string | null;
	shipping_cost?: number | string | null;
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

/** Merchandise plus shipping: what the order is actually worth to the buyer. */
export function orderGrandTotal(order: OrderAmounts): number {
	return toAmount(order.total_amount) + (orderShippingCost(order) ?? 0);
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
