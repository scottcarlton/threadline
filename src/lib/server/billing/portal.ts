import type Stripe from 'stripe';
import type { PlanTrack } from '$lib/billing/plans.js';

/**
 * One Customer Portal configuration per track, so a rep org can only switch
 * between rep plans and a brand org between brand plans. Each configuration
 * carries this metadata key, set by scripts/stripe-seed-plans.ts.
 */
export const PORTAL_TRACK_METADATA_KEY = 'threadline_track';

export function pickPortalConfiguration(
	configurations: Pick<Stripe.BillingPortal.Configuration, 'id' | 'active' | 'metadata'>[],
	track: PlanTrack
): string | null {
	const match = configurations.find(
		(c) => c.active && c.metadata?.[PORTAL_TRACK_METADATA_KEY] === track
	);
	return match?.id ?? null;
}
