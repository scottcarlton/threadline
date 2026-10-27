import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { CHECKOUT_INTEGRATION_ID, getStripe } from '$lib/server/billing/stripe.js';
import { isCheckoutOpen } from '$lib/server/beta.js';
import { isLiveStatus } from '$lib/billing/status.js';
import { canSubscribe, monthlyLookupKey } from '$lib/billing/plans.js';
import { checkoutSchema } from '$lib/schemas/billing.js';

// Starts a Stripe Checkout Session for the active org's subscription.
//
// Billing is an account-level op: admin/owner only (Notion "Roles & Access").
// The org is always locals.organization, never taken from the request, so a
// caller can only ever start checkout for an org they administer. Plan
// changes on an existing subscription go through the Customer Portal
// (/api/billing/portal), not here.

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	if (!isCheckoutOpen()) {
		return json({ error: 'Plans open when the beta ends' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const parsed = checkoutSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Unknown plan' }, { status: 400 });
	}
	const { plan } = parsed.data;
	if (!canSubscribe(locals.orgType, plan)) {
		return json({ error: 'That plan is not available for this organization' }, { status: 400 });
	}

	const org = locals.organization;

	const { data: existing, error: readError } = await supabaseAdmin
		.from('organization_subscriptions')
		.select('stripe_customer_id, status')
		.eq('organization_id', org.id)
		.maybeSingle();
	if (readError) {
		Sentry.captureException(readError, { tags: { area: 'billing', step: 'checkout_read' } });
		return json({ error: 'Could not start checkout' }, { status: 500 });
	}
	if (isLiveStatus(existing?.status)) {
		return json(
			{ error: 'This organization already has a subscription. Change it from Manage billing.' },
			{ status: 409 }
		);
	}

	try {
		const stripe = getStripe();

		let customerId = existing?.stripe_customer_id ?? null;
		if (!customerId) {
			const customer = await stripe.customers.create({
				name: org.name,
				email: locals.session.user.email ?? undefined,
				metadata: { organization_id: org.id }
			});
			const { error: insertError } = await supabaseAdmin
				.from('organization_subscriptions')
				.insert({ organization_id: org.id, stripe_customer_id: customer.id });
			if (insertError?.code === '23505') {
				// Lost a race with a second click; use the row that won. The
				// customer just created stays orphaned in Stripe, which is harmless.
				const { data: winner } = await supabaseAdmin
					.from('organization_subscriptions')
					.select('stripe_customer_id')
					.eq('organization_id', org.id)
					.single();
				customerId = winner?.stripe_customer_id ?? null;
			} else if (insertError) {
				throw insertError;
			} else {
				customerId = customer.id;
			}
			if (!customerId) throw new Error('No Stripe customer for org after insert race');
		}

		const prices = await stripe.prices.list({
			lookup_keys: [monthlyLookupKey(plan)],
			active: true,
			limit: 1
		});
		const price = prices.data[0];
		if (!price) throw new Error(`No active Stripe price for ${monthlyLookupKey(plan)}`);

		const session = await stripe.checkout.sessions.create({
			mode: 'subscription',
			customer: customerId,
			client_reference_id: org.id,
			line_items: [{ price: price.id, quantity: 1 }],
			// Stripe's recommended mode for new subscriptions: predictable
			// proration and access to newer billing features.
			subscription_data: { billing_mode: { type: 'flexible' } },
			success_url: `${url.origin}/organization/billing?checkout=success`,
			cancel_url: `${url.origin}/organization/billing`,
			integration_identifier: CHECKOUT_INTEGRATION_ID
		});
		if (!session.url) throw new Error('Checkout session has no URL');

		return json({ url: session.url });
	} catch (err) {
		Sentry.captureException(err, {
			tags: { area: 'billing', step: 'checkout' },
			extra: { organization_id: org.id, plan }
		});
		return json({ error: 'Could not start checkout' }, { status: 502 });
	}
};
