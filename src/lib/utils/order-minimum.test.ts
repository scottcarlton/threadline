import { describe, it, expect } from 'vitest';
import {
	effectiveOrderMinimum,
	minimumShortfall,
	minimumBlockedMessage,
	minimumBuyerMessage,
	minimumDraftHint,
	minimumOverrideNote
} from './order-minimum';

const brand = (enabled: boolean, amount: number | null) => ({
	order_minimum_enabled: enabled,
	order_minimum_amount: amount,
	owner_org_id: 'brand-org'
});

describe('effectiveOrderMinimum', () => {
	it('uses the brand minimum when enabled', () => {
		expect(effectiveOrderMinimum(brand(true, 500), null)).toBe(500);
	});

	it('is null when the brand minimum is off, even with an amount saved', () => {
		expect(effectiveOrderMinimum(brand(false, 500), null)).toBeNull();
	});

	it('is null for a zero or missing amount', () => {
		expect(effectiveOrderMinimum(brand(true, 0), null)).toBeNull();
		expect(effectiveOrderMinimum(brand(true, null), null)).toBeNull();
	});

	it("applies an override on the brand's own account", () => {
		const account = { organization_id: 'brand-org', order_minimum_override: '250' };
		expect(effectiveOrderMinimum(brand(true, 500), account)).toBe(250);
	});

	it('treats an override of 0 as no minimum for that account', () => {
		const account = { organization_id: 'brand-org', order_minimum_override: 0 };
		expect(effectiveOrderMinimum(brand(true, 500), account)).toBeNull();
	});

	it("ignores an override on an account another org owns (a rep's account)", () => {
		const account = { organization_id: 'rep-org', order_minimum_override: 0 };
		expect(effectiveOrderMinimum(brand(true, 500), account)).toBe(500);
	});

	it('ignores a null override', () => {
		const account = { organization_id: 'brand-org', order_minimum_override: null };
		expect(effectiveOrderMinimum(brand(true, 500), account)).toBe(500);
	});
});

describe('minimumShortfall', () => {
	it('returns the gap when under', () => {
		expect(minimumShortfall(380, 500)).toBe(120);
	});

	it('is null at or over the minimum', () => {
		expect(minimumShortfall(500, 500)).toBeNull();
		expect(minimumShortfall(612.5, 500)).toBeNull();
	});

	it('is null with no minimum', () => {
		expect(minimumShortfall(10, null)).toBeNull();
	});

	it('rounds to cents so float noise never blocks an order', () => {
		expect(minimumShortfall(0.1 + 0.2, 0.3)).toBeNull();
	});
});

describe('messages', () => {
	it('names the shortfall, the minimum and the brand', () => {
		expect(minimumBlockedMessage('Acme', 500, 120)).toBe(
			"This order is $120.00 under Acme's $500.00 minimum. Only Acme can submit it."
		);
		expect(minimumDraftHint('Acme')).toBe('Save it as a draft for Acme to review.');
	});

	it('tells a buyer how much to add', () => {
		expect(minimumBuyerMessage('Acme', 500, 120)).toBe(
			"Add $120.00 to reach Acme's $500.00 minimum."
		);
	});

	it('tells the brand it can still submit', () => {
		expect(minimumOverrideNote(500, 120)).toBe(
			'This order is $120.00 under your $500.00 minimum. You can still submit it.'
		);
	});
});
