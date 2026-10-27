import { describe, expect, it } from 'vitest';
import {
	PLAN_KEYS,
	canSubscribe,
	monthlyLookupKey,
	planFromLookupKey,
	plansForOrgType,
	trackForOrgType
} from './plans';

describe('plansForOrgType', () => {
	it('gives rep orgs the rep track in ladder order', () => {
		expect(plansForOrgType('rep').map((p) => p.key)).toEqual([
			'rep_starter',
			'rep_pro',
			'rep_max_pro'
		]);
	});

	it('gives brand orgs the brand track in ladder order', () => {
		expect(plansForOrgType('brand').map((p) => p.key)).toEqual([
			'brand_starter',
			'brand_growth',
			'brand_max'
		]);
	});

	it('gives retailer orgs nothing', () => {
		expect(plansForOrgType('retailer')).toEqual([]);
		expect(trackForOrgType('retailer')).toBeNull();
	});
});

describe('canSubscribe', () => {
	it('allows a plan on the org’s own track', () => {
		expect(canSubscribe('rep', 'rep_pro')).toBe(true);
		expect(canSubscribe('brand', 'brand_growth')).toBe(true);
	});

	it('refuses a plan on the other track', () => {
		expect(canSubscribe('rep', 'brand_max')).toBe(false);
		expect(canSubscribe('brand', 'rep_starter')).toBe(false);
	});

	it('refuses every plan for a retailer', () => {
		for (const key of PLAN_KEYS) expect(canSubscribe('retailer', key)).toBe(false);
	});
});

describe('lookup keys', () => {
	it('round-trips every plan', () => {
		for (const key of PLAN_KEYS) expect(planFromLookupKey(monthlyLookupKey(key))).toBe(key);
	});

	it('rejects keys that are not ours', () => {
		expect(planFromLookupKey(null)).toBeNull();
		expect(planFromLookupKey(undefined)).toBeNull();
		expect(planFromLookupKey('rep_pro')).toBeNull();
		expect(planFromLookupKey('rep_pro_annual')).toBeNull();
		expect(planFromLookupKey('enterprise_monthly')).toBeNull();
		expect(planFromLookupKey('_monthly')).toBeNull();
	});
});
