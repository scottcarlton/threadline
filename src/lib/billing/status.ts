/** Statuses where the org still has a subscription that the portal manages. */
const LIVE_STATUSES = new Set(['trialing', 'active', 'past_due', 'unpaid', 'paused']);

/** Statuses where a payment needs fixing before the plan can continue. */
const PAYMENT_ISSUE_STATUSES = new Set(['past_due', 'unpaid']);

export function isLiveStatus(status: string | null | undefined): boolean {
	return !!status && LIVE_STATUSES.has(status);
}

export function hasPaymentIssue(status: string | null | undefined): boolean {
	return !!status && PAYMENT_ISSUE_STATUSES.has(status);
}
