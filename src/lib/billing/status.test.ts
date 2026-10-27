import { describe, expect, it } from 'vitest';
import { hasPaymentIssue, isLiveStatus } from './status';

describe('isLiveStatus', () => {
	it('treats billable statuses as live', () => {
		for (const s of ['trialing', 'active', 'past_due', 'unpaid', 'paused']) {
			expect(isLiveStatus(s)).toBe(true);
		}
	});

	it('treats terminal, incomplete, and missing as not live', () => {
		for (const s of ['canceled', 'incomplete_expired', 'incomplete', null, undefined]) {
			expect(isLiveStatus(s)).toBe(false);
		}
	});
});

describe('hasPaymentIssue', () => {
	it('flags past_due and unpaid only', () => {
		expect(hasPaymentIssue('past_due')).toBe(true);
		expect(hasPaymentIssue('unpaid')).toBe(true);
		for (const s of ['active', 'trialing', 'paused', 'canceled', null]) {
			expect(hasPaymentIssue(s)).toBe(false);
		}
	});
});
