import type { OrgType } from '$lib/types/database.js';
import { PLANS, isPlanKey, trackForOrgType, type PlanKey, type PlanTrack } from './plans.js';
import { isLiveStatus } from './status.js';

/**
 * What each plan allows, as numbers the server enforces (SCO-47).
 *
 * This is the one table to edit when pricing changes. Gates read limits from
 * here and never from a plan name, so new pricing is a change to these rows,
 * not to the endpoints.
 *
 * `null` means unlimited. A limit only applies on its own track: rep orgs
 * count brand connections, brand orgs count connected reps.
 */
export type PlanLimits = {
	/** Non-guest members, counting pending non-guest invitations. */
	seats: number | null;
	/** Active connections to brand orgs (rep track). */
	brandConnections: number | null;
	/** Active connections to rep orgs (brand track). */
	connectedReps: number | null;
};

export type EffectivePlan = PlanKey | 'free';

const UNLIMITED: PlanLimits = { seats: null, brandConnections: null, connectedReps: null };

/** Mirrors the features listed for each plan in plans.ts. */
export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
	rep_starter: { ...UNLIMITED, seats: 1, brandConnections: 3 },
	rep_pro: { ...UNLIMITED, seats: 1 },
	rep_max_pro: { ...UNLIMITED, seats: 3 },
	brand_starter: { ...UNLIMITED, connectedReps: 5 },
	brand_growth: { ...UNLIMITED, connectedReps: 25 },
	brand_max: { ...UNLIMITED }
};

/**
 * The fallback for an org with no live subscription once the beta ends.
 *
 * PLACEHOLDER VALUES. Pricing is being redefined and the free tier has no
 * agreed limits yet. Nothing reads these while the beta is on, so they
 * cannot affect anyone until the beta flag is turned off; set the real
 * numbers before then.
 */
export const FREE_LIMITS: Record<PlanTrack, PlanLimits> = {
	rep: { ...UNLIMITED, seats: 1, brandConnections: 1 },
	brand: { ...UNLIMITED, seats: 1, connectedReps: 1 }
};

/** Roles that never take a seat. */
export const SEATLESS_ROLES: ReadonlySet<string> = new Set(['guest']);

export function takesSeat(role: string): boolean {
	return !SEATLESS_ROLES.has(role);
}

type SubscriptionRow = { plan: string | null; status: string | null } | null | undefined;

/**
 * The plan an org is held to. A subscription counts while Stripe still
 * considers it live (trialing, active, past_due, unpaid, paused), so a failed
 * card does not drop limits mid dunning. Anything else, including a plan from
 * the other track, falls back to free. Orgs with no track (retailers) have no
 * plan and no limits.
 */
export function effectivePlan(orgType: OrgType, sub: SubscriptionRow): EffectivePlan | null {
	const track = trackForOrgType(orgType);
	if (!track) return null;
	if (sub && isLiveStatus(sub.status) && isPlanKey(sub.plan) && PLANS[sub.plan].track === track) {
		return sub.plan;
	}
	return 'free';
}

export function limitsFor(orgType: OrgType, plan: EffectivePlan | null): PlanLimits {
	const track = trackForOrgType(orgType);
	if (!track || !plan) return UNLIMITED;
	return plan === 'free' ? FREE_LIMITS[track] : PLAN_LIMITS[plan];
}

/** True when adding `adding` more keeps the org within `limit`. */
export function withinLimit(limit: number | null, current: number, adding = 1): boolean {
	return limit === null || current + adding <= limit;
}
