import type Stripe from 'stripe';
import { planFromLookupKey, type PlanKey } from '$lib/billing/plans.js';

export interface SubscriptionRowUpdate {
	stripe_subscription_id: string;
	plan: PlanKey;
	status: string;
	current_period_end: string | null;
	cancel_at_period_end: boolean;
}

/** Statuses after which a subscription can never bill again. */
const TERMINAL_STATUSES = new Set(['canceled', 'incomplete_expired']);

export function customerIdOf(sub: Pick<Stripe.Subscription, 'customer'>): string {
	return typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
}

/**
 * Maps a freshly retrieved Subscription to our row. Null when none of its
 * prices is one of our plans, so a subscription created for something else on
 * the same Stripe account never lands in this table.
 *
 * Since API 2025-03-31 the billing period lives on each item, not the
 * subscription; the earliest item end is when the org next bills.
 */
export function subscriptionToRow(sub: Stripe.Subscription): SubscriptionRowUpdate | null {
	let plan: PlanKey | null = null;
	let periodEnd: number | null = null;
	for (const item of sub.items.data) {
		plan ??= planFromLookupKey(item.price.lookup_key);
		if (periodEnd === null || item.current_period_end < periodEnd) {
			periodEnd = item.current_period_end;
		}
	}
	if (!plan) return null;
	return {
		stripe_subscription_id: sub.id,
		plan,
		status: sub.status,
		current_period_end: periodEnd === null ? null : new Date(periodEnd * 1000).toISOString(),
		cancel_at_period_end: sub.cancel_at_period_end
	};
}

/**
 * Webhooks arrive out of order and can be for a subscription the org has
 * since replaced. A different subscription only takes over the row while it
 * can still bill; a late "canceled" for an old one must not clobber the new.
 */
export function shouldApply(
	currentSubscriptionId: string | null,
	incoming: { id: string; status: string }
): boolean {
	if (currentSubscriptionId === null || currentSubscriptionId === incoming.id) return true;
	return !TERMINAL_STATUSES.has(incoming.status);
}
