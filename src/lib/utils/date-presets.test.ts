import { describe, it, expect } from 'vitest';
import { computePreset, matchPreset, incrementDate } from './date-presets.js';

// Fixed reference date: Thursday, April 16, 2026.
const NOW = new Date(2026, 3, 16, 10, 30, 0); // month is 0-indexed

describe('computePreset', () => {
	it('returns null for "all"', () => {
		expect(computePreset('all', NOW)).toBeNull();
	});

	it('returns null for "custom"', () => {
		expect(computePreset('custom', NOW)).toBeNull();
	});

	it('last_7_days ends today and spans 7 days inclusive', () => {
		expect(computePreset('last_7_days', NOW)).toEqual({ from: '2026-04-10', to: '2026-04-16' });
	});

	it('last_30_days spans 30 days inclusive', () => {
		expect(computePreset('last_30_days', NOW)).toEqual({ from: '2026-03-18', to: '2026-04-16' });
	});

	it('last_90_days spans 90 days inclusive', () => {
		expect(computePreset('last_90_days', NOW)).toEqual({ from: '2026-01-17', to: '2026-04-16' });
	});

	it('this_month starts on the first of the current month', () => {
		expect(computePreset('this_month', NOW)).toEqual({ from: '2026-04-01', to: '2026-04-16' });
	});

	it('last_month covers the full previous calendar month', () => {
		expect(computePreset('last_month', NOW)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
	});

	it('last_month handles January (crossing year boundary)', () => {
		const jan = new Date(2026, 0, 10);
		expect(computePreset('last_month', jan)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
	});

	it('last_month handles March (February leap-year edge case)', () => {
		const march2028 = new Date(2028, 2, 5); // Feb 2028 has 29 days
		expect(computePreset('last_month', march2028)).toEqual({
			from: '2028-02-01',
			to: '2028-02-29'
		});
	});
});

describe('matchPreset', () => {
	it('returns "all" when both from and to are absent', () => {
		expect(matchPreset(null, null, NOW)).toBe('all');
	});

	it('returns "custom" when only one of from/to is present', () => {
		expect(matchPreset('2026-04-01', null, NOW)).toBe('custom');
		expect(matchPreset(null, '2026-04-15', NOW)).toBe('custom');
	});

	it('round-trips last_7_days', () => {
		const w = computePreset('last_7_days', NOW)!;
		expect(matchPreset(w.from, w.to, NOW)).toBe('last_7_days');
	});

	it('round-trips this_month', () => {
		const w = computePreset('this_month', NOW)!;
		expect(matchPreset(w.from, w.to, NOW)).toBe('this_month');
	});

	it('round-trips last_month', () => {
		const w = computePreset('last_month', NOW)!;
		expect(matchPreset(w.from, w.to, NOW)).toBe('last_month');
	});

	it('returns "custom" for an arbitrary window that does not match any preset', () => {
		expect(matchPreset('2026-04-03', '2026-04-11', NOW)).toBe('custom');
	});

	it('returns "custom" for a window that was valid yesterday but not today', () => {
		// Last 7 days as of 2026-04-15 would be 2026-04-09..2026-04-15
		expect(matchPreset('2026-04-09', '2026-04-15', NOW)).toBe('custom');
	});
});

describe('incrementDate', () => {
	it('rolls forward one day within a month', () => {
		expect(incrementDate('2026-04-16')).toBe('2026-04-17');
	});

	it('rolls across a month boundary', () => {
		expect(incrementDate('2026-04-30')).toBe('2026-05-01');
	});

	it('rolls across a year boundary', () => {
		expect(incrementDate('2026-12-31')).toBe('2027-01-01');
	});

	it('handles leap-year Feb 29 → Mar 1', () => {
		expect(incrementDate('2028-02-29')).toBe('2028-03-01');
	});
});
