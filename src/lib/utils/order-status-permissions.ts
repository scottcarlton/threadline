import type { OrgType } from '$lib/types/database';

/**
 * Statuses that describe the brand physically fulfilling an order.
 *
 * Only the brand that owns the goods knows when they are being picked, when
 * they leave the warehouse, and when they arrive. A rep sells the order; it is
 * not theirs to declare shipped. Letting the rep side set these produced
 * fulfillment timestamps nobody had observed, so the rep org is blocked from
 * all three regardless of whether the brand is a connected org or a brand row
 * the rep org owns locally.
 */
export const FULFILLMENT_STATUSES = new Set(['preparing', 'shipped', 'delivered']);

/** Whether an org of this type may move an order into `status`. */
export function mayAdvanceOrderStatus(orgType: OrgType, status: string): boolean {
	if (!FULFILLMENT_STATUSES.has(status)) return true;
	return orgType === 'brand';
}

/** Drop the statuses `orgType` may not set from a list of candidate transitions. */
export function allowedNextStatuses<T extends string>(orgType: OrgType, next: T[]): T[] {
	return next.filter((s) => mayAdvanceOrderStatus(orgType, s));
}

export const FULFILLMENT_STATUS_ERROR =
	'Only the brand can mark an order preparing, shipped, or delivered.';
