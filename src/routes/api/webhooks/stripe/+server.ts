import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type Stripe from 'stripe';
import type { RequestHandler } from './$types';
import { getStripe, getWebhookSecret } from '$lib/server/billing/stripe.js';
import { isRiskEvent, subscriptionIdFromEvent } from '$lib/server/billing/events.js';
import { syncSubscription } from '$lib/server/billing/sync.js';

// Stripe webhook for platform billing. System endpoint: no session, trust
// comes from the signature alone. Every lifecycle event re-reads the
// subscription from Stripe and mirrors it (src/lib/server/billing/sync.ts),
// so redelivery and out-of-order delivery are both safe.
//
// Endpoint events to enable in Stripe: SUBSCRIPTION_EVENTS and RISK_EVENTS
// in src/lib/server/billing/events.ts.

export const POST: RequestHandler = async ({ request }) => {
	const signature = request.headers.get('stripe-signature');
	if (!signature) {
		return json({ error: 'Missing signature' }, { status: 400 });
	}

	const raw = await request.text();
	let event: Stripe.Event;
	try {
		event = await getStripe().webhooks.constructEventAsync(raw, signature, getWebhookSecret());
	} catch {
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	if (isRiskEvent(event.type)) {
		Sentry.captureMessage(`[billing] ${event.type}`, {
			level: 'warning',
			tags: { area: 'billing', stripe_event: event.type },
			extra: { event_id: event.id }
		});
		return json({ received: true });
	}

	const subscriptionId = subscriptionIdFromEvent(event);
	if (!subscriptionId) return json({ received: true });

	try {
		const result = await syncSubscription(subscriptionId);
		if (result === 'unknown_customer' || result === 'not_a_plan') {
			Sentry.captureMessage(`[billing] webhook skipped: ${result}`, {
				level: 'info',
				tags: { area: 'billing', stripe_event: event.type },
				extra: { event_id: event.id, subscription_id: subscriptionId }
			});
		}
	} catch (err) {
		Sentry.captureException(err, {
			tags: { area: 'billing', stripe_event: event.type },
			extra: { event_id: event.id, subscription_id: subscriptionId }
		});
		// Non-2xx so Stripe retries.
		return json({ error: 'Sync failed' }, { status: 500 });
	}

	return json({ received: true });
};
