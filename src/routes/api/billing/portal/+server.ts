import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { getStripe } from '$lib/server/billing/stripe.js';
import { pickPortalConfiguration } from '$lib/server/billing/portal.js';
import { trackForOrgType } from '$lib/billing/plans.js';

// Opens the Stripe Customer Portal for the active org: plan changes,
// cancellation, payment methods, and invoice history all live there. The
// portal configuration is the org's own track, so plan switching never
// offers a rep org a brand plan or the reverse.
// Admin/owner only, and the customer is looked up by locals.organization,
// so a caller can only ever open the portal for an org they administer.

export const POST: RequestHandler = async ({ locals, url }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const { data: row } = await supabaseAdmin
		.from('organization_subscriptions')
		.select('stripe_customer_id')
		.eq('organization_id', locals.organization.id)
		.maybeSingle();
	if (!row) {
		return json({ error: 'No billing account for this organization yet' }, { status: 404 });
	}

	const track = trackForOrgType(locals.orgType);
	if (!track) {
		return json({ error: 'Billing is not available for this organization' }, { status: 400 });
	}

	try {
		const stripe = getStripe();
		const configurations = await stripe.billingPortal.configurations.list({
			active: true,
			limit: 100
		});
		const configuration = pickPortalConfiguration(configurations.data, track);
		if (!configuration) throw new Error(`No portal configuration for track ${track}`);

		const session = await stripe.billingPortal.sessions.create({
			customer: row.stripe_customer_id,
			configuration,
			return_url: `${url.origin}/organization/billing`
		});
		return json({ url: session.url });
	} catch (err) {
		Sentry.captureException(err, {
			tags: { area: 'billing', step: 'portal' },
			extra: { organization_id: locals.organization.id }
		});
		return json({ error: 'Could not open billing' }, { status: 502 });
	}
};
