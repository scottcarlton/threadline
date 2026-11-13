import { describe, expect, it } from 'vitest';
import {
	FREE_LIMITS,
	PLAN_LIMITS,
	effectivePlan,
	limitsFor,
	takesSeat,
	withinLimit
} from './entitlements';
import { PLAN_KEYS } from './plans';

describe('PLAN_LIMITS', () => {
	it('covers every plan', () => {
		expect(Object.keys(PLAN_LIMITS).sort()).toEqual([...PLAN_KEYS].sort());
	});

	it('only limits connections on the matching track', () => {
		for (const key of PLAN_KEYS) {
			if (key.startsWith('rep_')) expect(PLAN_LIMITS[key].connectedReps).toBeNull();
			else expect(PLAN_LIMITS[key].brandConnections).toBeNull();
		}
	});
});

describe('effectivePlan', () => {
	it('uses a live subscription on the org track', () => {
		for (const status of ['trialing', 'active', 'past_due', 'unpaid', 'paused']) {
			expect(effectivePlan('rep', { plan: 'rep_pro', status })).toBe('rep_pro');
		}
	});

	it('falls back to free with no subscription', () => {
		expect(effectivePlan('rep', null)).toBe('free');
		expect(effectivePlan('brand', undefined)).toBe('free');
		expect(effectivePlan('brand', { plan: null, status: null })).toBe('free');
	});

	it.each(['canceled', 'incomplete', 'incomplete_expired', 'something_new'])(
		'falls back to free when the subscription is %s',
		(status) => {
			expect(effectivePlan('brand', { plan: 'brand_max', status })).toBe('free');
		}
	);

	it('ignores a plan from the other track', () => {
		expect(effectivePlan('rep', { plan: 'brand_max', status: 'active' })).toBe('free');
	});

	it('ignores an unknown plan key', () => {
		expect(effectivePlan('rep', { plan: 'rep_platinum', status: 'active' })).toBe('free');
	});

	it('gives retailer orgs no plan', () => {
		expect(effectivePlan('retailer', { plan: 'rep_pro', status: 'active' })).toBeNull();
	});
});

describe('limitsFor', () => {
	it('returns the plan row for a paid plan', () => {
		expect(limitsFor('rep', 'rep_starter')).toEqual(PLAN_LIMITS.rep_starter);
		expect(limitsFor('brand', 'brand_growth').connectedReps).toBe(25);
	});

	it('returns the track free row for free', () => {
		expect(limitsFor('rep', 'free')).toEqual(FREE_LIMITS.rep);
		expect(limitsFor('brand', 'free')).toEqual(FREE_LIMITS.brand);
	});

	it('is unlimited for orgs without a track', () => {
		expect(limitsFor('retailer', null)).toEqual({
			seats: null,
			brandConnections: null,
			connectedReps: null
		});
	});
});

describe('takesSeat', () => {
	it('frees guests and charges everyone else', () => {
		expect(takesSeat('guest')).toBe(false);
		for (const role of ['owner', 'admin', 'member', 'sales']) expect(takesSeat(role)).toBe(true);
	});
});

describe('withinLimit', () => {
	it('allows up to and including the limit', () => {
		expect(withinLimit(3, 2)).toBe(true);
		expect(withinLimit(3, 3)).toBe(false);
		expect(withinLimit(3, 1, 2)).toBe(true);
		expect(withinLimit(3, 2, 2)).toBe(false);
	});

	it('never refuses when unlimited', () => {
		expect(withinLimit(null, 10_000)).toBe(true);
	});

	it('refuses growth for an org already over its limit', () => {
		expect(withinLimit(1, 4)).toBe(false);
	});
});
