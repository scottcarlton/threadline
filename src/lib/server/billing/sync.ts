import { supabaseAdmin } from '$lib/server/supabase.js';
import { getStripe } from './stripe.js';
import { customerIdOf, shouldApply, subscriptionToRow } from './subscription-sync.js';

export type SyncResult = 'updated' | 'unknown_customer' | 'not_a_plan' | 'superseded';

/**
 * Re-reads a subscription from Stripe and mirrors it onto the owning org's
 * row. The org is resolved from the subscription's customer, which only ever
 * gets a row through our own checkout endpoint (the ownership check). A
 * customer with no row is acknowledged and left alone, never inserted.
 */
export async function syncSubscription(subscriptionId: string): Promise<SyncResult> {
	const sub = await getStripe().subscriptions.retrieve(subscriptionId);
	const customerId = customerIdOf(sub);

	const { data: existing, error: readError } = await supabaseAdmin
		.from('organization_subscriptions')
		.select('organization_id, stripe_subscription_id')
		.eq('stripe_customer_id', customerId)
		.maybeSingle();
	if (readError) throw readError;
	if (!existing) return 'unknown_customer';

	const row = subscriptionToRow(sub);
	if (!row) return 'not_a_plan';
	if (!shouldApply(existing.stripe_subscription_id, { id: sub.id, status: sub.status })) {
		return 'superseded';
	}

	const { error } = await supabaseAdmin
		.from('organization_subscriptions')
		.update(row)
		.eq('organization_id', existing.organization_id)
		.eq('stripe_customer_id', customerId);
	if (error) throw error;
	return 'updated';
}
