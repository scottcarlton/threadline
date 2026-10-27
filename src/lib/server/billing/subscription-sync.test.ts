import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { customerIdOf, shouldApply, subscriptionToRow } from './subscription-sync';

function sub(overrides: {
	id?: string;
	status?: string;
	cancel_at_period_end?: boolean;
	items?: Array<{ lookup_key: string | null; current_period_end: number }>;
}): Stripe.Subscription {
	const items = overrides.items ?? [
		{ lookup_key: 'rep_pro_monthly', current_period_end: 1_800_000_000 }
	];
	return {
		id: overrides.id ?? 'sub_1',
		customer: 'cus_1',
		status: overrides.status ?? 'active',
		cancel_at_period_end: overrides.cancel_at_period_end ?? false,
		items: {
			data: items.map((i) => ({
				price: { lookup_key: i.lookup_key },
				current_period_end: i.current_period_end
			}))
		}
	} as unknown as Stripe.Subscription;
}

describe('subscriptionToRow', () => {
	it('maps a plan subscription', () => {
		expect(subscriptionToRow(sub({ cancel_at_period_end: true }))).toEqual({
			stripe_subscription_id: 'sub_1',
			plan: 'rep_pro',
			status: 'active',
			current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
			cancel_at_period_end: true
		});
	});

	it('returns null when no item is one of our plans', () => {
		expect(
			subscriptionToRow(sub({ items: [{ lookup_key: 'something_else', current_period_end: 1 }] }))
		).toBeNull();
		expect(
			subscriptionToRow(sub({ items: [{ lookup_key: null, current_period_end: 1 }] }))
		).toBeNull();
	});

	it('finds the plan on any item and uses the earliest period end', () => {
		const row = subscriptionToRow(
			sub({
				items: [
					{ lookup_key: null, current_period_end: 2_000 },
					{ lookup_key: 'brand_growth_monthly', current_period_end: 1_000 }
				]
			})
		);
		expect(row?.plan).toBe('brand_growth');
		expect(row?.current_period_end).toBe(new Date(1_000_000).toISOString());
	});

	it('passes Stripe status through verbatim', () => {
		expect(subscriptionToRow(sub({ status: 'past_due' }))?.status).toBe('past_due');
	});
});

describe('shouldApply', () => {
	it('applies to a row with no subscription yet', () => {
		expect(shouldApply(null, { id: 'sub_1', status: 'incomplete' })).toBe(true);
	});

	it('applies any status for the same subscription', () => {
		expect(shouldApply('sub_1', { id: 'sub_1', status: 'canceled' })).toBe(true);
	});

	it('lets a new live subscription replace the old one', () => {
		expect(shouldApply('sub_old', { id: 'sub_new', status: 'active' })).toBe(true);
	});

	it('ignores a late terminal event for a replaced subscription', () => {
		expect(shouldApply('sub_new', { id: 'sub_old', status: 'canceled' })).toBe(false);
		expect(shouldApply('sub_new', { id: 'sub_old', status: 'incomplete_expired' })).toBe(false);
	});
});

describe('customerIdOf', () => {
	it('handles an id or an expanded customer', () => {
		expect(customerIdOf({ customer: 'cus_1' })).toBe('cus_1');
		expect(customerIdOf({ customer: { id: 'cus_2' } as Stripe.Customer })).toBe('cus_2');
	});
});
