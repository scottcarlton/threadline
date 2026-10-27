import type { OrgType } from '$lib/types/database.js';

/**
 * Self-serve subscription plans, one Stripe Product per plan.
 *
 * Source: the Notion pricing options page. Rep orgs and brand orgs are
 * separate tracks; an org can only subscribe to a plan on its own track.
 * Enterprise is sales-led and is not a plan here. Monthly billing only for now.
 *
 * Each plan's monthly Stripe Price carries `lookup_key` = `${key}_monthly`,
 * so checkout resolves the price by key instead of per-environment price IDs.
 */
export type PlanTrack = 'rep' | 'brand';

export const PLAN_KEYS = [
	'rep_starter',
	'rep_pro',
	'rep_max_pro',
	'brand_starter',
	'brand_growth',
	'brand_max'
] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

export interface Plan {
	key: PlanKey;
	track: PlanTrack;
	name: string;
	/** Whole US dollars per month, list price. */
	monthlyPrice: number;
	/** What the plan includes, shown on the billing page. */
	features: string[];
}

export const PLANS: Record<PlanKey, Plan> = {
	rep_starter: {
		key: 'rep_starter',
		track: 'rep',
		name: 'Starter',
		monthlyPrice: 49,
		features: [
			'1 seat',
			'Up to 3 brand connections',
			'Orders, accounts, territories, and shows',
			'Gmail and Outlook'
		]
	},
	rep_pro: {
		key: 'rep_pro',
		track: 'rep',
		name: 'Pro',
		monthlyPrice: 100,
		features: [
			'1 seat',
			'Unlimited brand connections',
			'Stitch daily briefing, revenue leakage, and order gaps',
			'Line sheet parsing',
			'Slack, Notion, and Google Sheets'
		]
	},
	rep_max_pro: {
		key: 'rep_max_pro',
		track: 'rep',
		name: 'Max Pro',
		monthlyPrice: 200,
		features: [
			'3 seats',
			'Everything in Pro',
			'Commission splits across reps',
			'Agency reporting and custom reports'
		]
	},
	brand_starter: {
		key: 'brand_starter',
		track: 'brand',
		name: 'Starter',
		monthlyPrice: 149,
		features: [
			'Up to 5 connected reps',
			'One catalog for every rep',
			'Line sheet parsing',
			'Orders from connected reps'
		]
	},
	brand_growth: {
		key: 'brand_growth',
		track: 'brand',
		name: 'Growth',
		monthlyPrice: 399,
		features: [
			'Up to 25 connected reps',
			'Everything in Starter',
			'Commission rates per rep',
			'Connection management'
		]
	},
	brand_max: {
		key: 'brand_max',
		track: 'brand',
		name: 'Max',
		monthlyPrice: 699,
		features: ['Unlimited connected reps', 'Everything in Growth', 'Custom agents']
	}
};

export function isPlanKey(value: unknown): value is PlanKey {
	return typeof value === 'string' && (PLAN_KEYS as readonly string[]).includes(value);
}

/** Retailer orgs have no self-serve track. */
export function trackForOrgType(orgType: OrgType): PlanTrack | null {
	if (orgType === 'rep' || orgType === 'brand') return orgType;
	return null;
}

export function plansForOrgType(orgType: OrgType): Plan[] {
	const track = trackForOrgType(orgType);
	if (!track) return [];
	return PLAN_KEYS.map((k) => PLANS[k]).filter((p) => p.track === track);
}

export function canSubscribe(orgType: OrgType, plan: PlanKey): boolean {
	return trackForOrgType(orgType) === PLANS[plan].track;
}

export function monthlyLookupKey(plan: PlanKey): string {
	return `${plan}_monthly`;
}

/** Reverse of `monthlyLookupKey`. Null for any price that isn't one of ours. */
export function planFromLookupKey(lookupKey: string | null | undefined): PlanKey | null {
	if (!lookupKey?.endsWith('_monthly')) return null;
	const key = lookupKey.slice(0, -'_monthly'.length);
	return isPlanKey(key) ? key : null;
}
