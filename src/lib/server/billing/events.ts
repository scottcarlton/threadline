import type Stripe from 'stripe';

/**
 * Events the webhook acts on. Configure the Stripe webhook endpoint with
 * exactly this list; anything else is acknowledged and ignored.
 */
export const SUBSCRIPTION_EVENTS = [
	'checkout.session.completed',
	'customer.subscription.created',
	'customer.subscription.updated',
	'customer.subscription.deleted',
	'customer.subscription.paused',
	'customer.subscription.resumed',
	'invoice.paid',
	'invoice.payment_failed'
] as const;

/** Money already moved or at risk. No automated response yet; a person looks. */
export const RISK_EVENTS = [
	'charge.dispute.created',
	'charge.refunded',
	'radar.early_fraud_warning.created'
] as const;

function idOf(ref: string | { id: string } | null | undefined): string | null {
	if (!ref) return null;
	return typeof ref === 'string' ? ref : ref.id;
}

/**
 * The subscription a lifecycle event concerns, resolved through Stripe's own
 * object graph (never metadata). The caller re-retrieves it, so the event
 * payload's possibly stale snapshot is never what gets written.
 */
export function subscriptionIdFromEvent(event: Stripe.Event): string | null {
	switch (event.type) {
		case 'checkout.session.completed': {
			const session = event.data.object;
			return session.mode === 'subscription' ? idOf(session.subscription) : null;
		}
		case 'customer.subscription.created':
		case 'customer.subscription.updated':
		case 'customer.subscription.deleted':
		case 'customer.subscription.paused':
		case 'customer.subscription.resumed':
			return event.data.object.id;
		case 'invoice.paid':
		case 'invoice.payment_failed':
			return idOf(event.data.object.parent?.subscription_details?.subscription);
		default:
			return null;
	}
}

export function isRiskEvent(type: string): boolean {
	return (RISK_EVENTS as readonly string[]).includes(type);
}
