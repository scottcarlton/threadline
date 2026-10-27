import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { isRiskEvent, subscriptionIdFromEvent } from './events';

function event(type: string, object: unknown): Stripe.Event {
	return { type, data: { object } } as unknown as Stripe.Event;
}

describe('subscriptionIdFromEvent', () => {
	it('reads the subscription off a subscription-mode checkout session', () => {
		expect(
			subscriptionIdFromEvent(
				event('checkout.session.completed', { mode: 'subscription', subscription: 'sub_1' })
			)
		).toBe('sub_1');
		expect(
			subscriptionIdFromEvent(
				event('checkout.session.completed', { mode: 'subscription', subscription: { id: 'sub_2' } })
			)
		).toBe('sub_2');
	});

	it('ignores a non-subscription checkout session', () => {
		expect(
			subscriptionIdFromEvent(
				event('checkout.session.completed', { mode: 'payment', subscription: null })
			)
		).toBeNull();
	});

	it('uses the object id for subscription lifecycle events', () => {
		for (const type of [
			'customer.subscription.created',
			'customer.subscription.updated',
			'customer.subscription.deleted',
			'customer.subscription.paused',
			'customer.subscription.resumed'
		]) {
			expect(subscriptionIdFromEvent(event(type, { id: 'sub_3' }))).toBe('sub_3');
		}
	});

	it('reads the subscription off an invoice parent', () => {
		const invoice = { parent: { subscription_details: { subscription: 'sub_4' } } };
		expect(subscriptionIdFromEvent(event('invoice.paid', invoice))).toBe('sub_4');
		expect(subscriptionIdFromEvent(event('invoice.payment_failed', invoice))).toBe('sub_4');
	});

	it('returns null for an invoice with no subscription', () => {
		expect(subscriptionIdFromEvent(event('invoice.paid', { parent: null }))).toBeNull();
		expect(
			subscriptionIdFromEvent(event('invoice.paid', { parent: { subscription_details: null } }))
		).toBeNull();
	});

	it('returns null for events it does not handle', () => {
		expect(subscriptionIdFromEvent(event('customer.created', { id: 'cus_1' }))).toBeNull();
	});
});

describe('isRiskEvent', () => {
	it('flags disputes, refunds, and early fraud warnings', () => {
		expect(isRiskEvent('charge.dispute.created')).toBe(true);
		expect(isRiskEvent('charge.refunded')).toBe(true);
		expect(isRiskEvent('radar.early_fraud_warning.created')).toBe(true);
		expect(isRiskEvent('invoice.paid')).toBe(false);
	});
});
