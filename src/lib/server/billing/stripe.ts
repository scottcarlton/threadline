import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let client: Stripe | null = null;

/**
 * Lazily built so a deploy without Stripe keys still boots; only the billing
 * endpoints fail, and they say why.
 */
export function getStripe(): Stripe {
	if (client) return client;
	const key = env.STRIPE_SECRET_KEY;
	if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
	client = new Stripe(key);
	return client;
}

export function getWebhookSecret(): string {
	const secret = env.STRIPE_WEBHOOK_SECRET;
	if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
	return secret;
}

/**
 * Tags Checkout Sessions from this flow in the Stripe Dashboard. Fixed, so
 * every session from the org subscription flow groups under one label.
 */
export const CHECKOUT_INTEGRATION_ID = 'threadline_org_subscription_qmvrtkhz';
