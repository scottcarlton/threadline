import { describe, expect, it } from 'vitest';
import {
	TREND_MONTHS,
	buildSalesTrend,
	changeFromPrior,
	niceTicks,
	trendWindowStart
} from './sales-trend';

const NOW = new Date('2026-11-13T12:00:00Z');

describe('trendWindowStart', () => {
	it('starts 23 months before the current month, on the 1st', () => {
		expect(trendWindowStart(NOW).toISOString()).toBe('2024-12-01T00:00:00.000Z');
	});
});

describe('buildSalesTrend', () => {
	it('returns 12 months ending with the current one, oldest first', () => {
		const t = buildSalesTrend([], NOW);
		expect(t.months).toHaveLength(TREND_MONTHS);
		expect(t.months[0]).toMatchObject({ key: '2025-12', label: 'Dec', year: 2025 });
		expect(t.months.at(-1)).toMatchObject({ key: '2026-11', label: 'Nov', year: 2026 });
		expect(t.empty).toBe(true);
	});

	it('sums revenue and counts orders per month, with the prior-year twin', () => {
		const t = buildSalesTrend(
			[
				{ created_at: '2026-03-02T10:00:00Z', total_amount: '1200.50' },
				{ created_at: '2026-03-28T23:59:59Z', total_amount: 300 },
				{ created_at: '2025-03-15T00:00:00Z', total_amount: 900 }
			],
			NOW
		);
		const mar = t.months.find((m) => m.key === '2026-03')!;
		expect(mar.current).toEqual({ revenue: 1500.5, orders: 2 });
		expect(mar.prior).toEqual({ revenue: 900, orders: 1 });
		expect(t.empty).toBe(false);
	});

	it('pairs a recent December with the December before it', () => {
		const t = buildSalesTrend([{ created_at: '2024-12-05T00:00:00Z', total_amount: 50 }], NOW);
		expect(t.months[0].prior).toEqual({ revenue: 50, orders: 1 });
	});

	it('buckets by UTC month at the boundary', () => {
		const t = buildSalesTrend([{ created_at: '2026-10-31T23:30:00-05:00', total_amount: 10 }], NOW);
		expect(t.months.find((m) => m.key === '2026-11')!.current.orders).toBe(1);
	});

	it('counts an order with no amount without breaking revenue', () => {
		const t = buildSalesTrend([{ created_at: '2026-06-01T00:00:00Z', total_amount: null }], NOW);
		expect(t.months.find((m) => m.key === '2026-06')!.current).toEqual({ revenue: 0, orders: 1 });
	});

	it('skips unparseable dates', () => {
		expect(buildSalesTrend([{ created_at: 'nope', total_amount: 5 }], NOW).empty).toBe(true);
	});
});

describe('changeFromPrior', () => {
	it('is the fractional change', () => {
		expect(changeFromPrior(150, 100)).toBe(0.5);
		expect(changeFromPrior(50, 100)).toBe(-0.5);
	});

	it('is null with nothing to compare against', () => {
		expect(changeFromPrior(100, 0)).toBeNull();
	});
});

describe('niceTicks', () => {
	it('starts at 0 and ends at or above the max on round steps', () => {
		expect(niceTicks(38_000)).toEqual([0, 10_000, 20_000, 30_000, 40_000]);
		expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
	});

	it('has a usable scale when everything is zero', () => {
		expect(niceTicks(0)).toEqual([0, 1]);
	});
});
