import { describe, it, expect } from 'vitest';
import {
	isDisabled,
	deriveSeasonWindow,
	defaultRange,
	sameDay,
	isBefore,
	daysBetween,
	toISODate
} from './helpers';

describe('deriveSeasonWindow', () => {
	it('returns null for empty deliveries', () => {
		expect(deriveSeasonWindow([], 2026)).toBeNull();
	});

	it('derives window from single delivery', () => {
		const w = deriveSeasonWindow([{ delivery_month: 9, delivery_day: 30 }], 2026)!;
		expect(toISODate(w.startDate)).toBe('2026-09-01');
		expect(toISODate(w.endDate)).toBe('2026-09-30');
	});

	it('derives window spanning multiple deliveries', () => {
		const w = deriveSeasonWindow(
			[
				{ delivery_month: 9, delivery_day: 15 },
				{ delivery_month: 11, delivery_day: 30 }
			],
			2026
		)!;
		expect(toISODate(w.startDate)).toBe('2026-09-01');
		expect(toISODate(w.endDate)).toBe('2026-11-30');
	});
});

describe('defaultRange', () => {
	it('defaults to first month of season window', () => {
		const w = deriveSeasonWindow(
			[
				{ delivery_month: 9, delivery_day: 15 },
				{ delivery_month: 11, delivery_day: 30 }
			],
			2026
		)!;
		const range = defaultRange(w)!;
		expect(toISODate(range.start)).toBe('2026-09-01');
		expect(toISODate(range.end)).toBe('2026-09-30');
	});

	it('clamps end to season endDate when season is shorter than one month', () => {
		const w = deriveSeasonWindow([{ delivery_month: 9, delivery_day: 15 }], 2026)!;
		const range = defaultRange(w)!;
		expect(toISODate(range.start)).toBe('2026-09-01');
		expect(toISODate(range.end)).toBe('2026-09-15');
	});

	it('returns null when no window', () => {
		expect(defaultRange(null)).toBeNull();
	});
});

describe('isDisabled', () => {
	const w = deriveSeasonWindow(
		[
			{ delivery_month: 9, delivery_day: 15 },
			{ delivery_month: 11, delivery_day: 30 }
		],
		2026
	)!;

	it('returns true for date before season start', () => {
		expect(isDisabled(new Date(2026, 7, 31), w)).toBe(true);
	});

	it('returns false for date after season end (no end constraint)', () => {
		expect(isDisabled(new Date(2026, 11, 1), w)).toBe(false);
	});

	it('returns false for date inside season', () => {
		expect(isDisabled(new Date(2026, 9, 15), w)).toBe(false);
	});

	it('returns false for start boundary', () => {
		expect(isDisabled(new Date(2026, 8, 1), w)).toBe(false);
	});

	it('returns false for end boundary', () => {
		expect(isDisabled(new Date(2026, 10, 30), w)).toBe(false);
	});

	it('returns false when no window (unconstrained)', () => {
		expect(isDisabled(new Date(2026, 0, 1), null)).toBe(false);
	});
});

describe('pick behavior', () => {
	it('pick start before existing end keeps end', () => {
		const draftEnd = new Date(2026, 8, 20);
		const picked = new Date(2026, 8, 3);
		const newEnd = isBefore(draftEnd, picked) ? null : draftEnd;
		expect(sameDay(picked, new Date(2026, 8, 3))).toBe(true);
		expect(newEnd).not.toBeNull();
		expect(sameDay(newEnd!, new Date(2026, 8, 20))).toBe(true);
	});

	it('pick start after existing end clears end', () => {
		const draftEnd = new Date(2026, 8, 20);
		const picked = new Date(2026, 8, 25);
		const newEnd = isBefore(draftEnd, picked) ? null : draftEnd;
		expect(newEnd).toBeNull();
	});

	it('pick end before start swaps', () => {
		const draftStart = new Date(2026, 8, 15);
		const picked = new Date(2026, 8, 5);
		let newStart: Date;
		let newEnd: Date;
		if (isBefore(picked, draftStart)) {
			newEnd = draftStart;
			newStart = picked;
		} else {
			newEnd = picked;
			newStart = draftStart;
		}
		expect(sameDay(newStart, new Date(2026, 8, 5))).toBe(true);
		expect(sameDay(newEnd, new Date(2026, 8, 15))).toBe(true);
	});
});

describe('daysBetween', () => {
	it('calculates duration', () => {
		expect(daysBetween(new Date(2026, 8, 4), new Date(2026, 8, 30))).toBe(26);
	});

	it('same day is 0', () => {
		expect(daysBetween(new Date(2026, 8, 4), new Date(2026, 8, 4))).toBe(0);
	});
});
