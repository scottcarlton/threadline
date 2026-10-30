import { describe, expect, it } from 'vitest';
import { buildReportChart, rankAndFold, TOP_N } from './report-chart';

const bar = (label: string, value: number) => ({ label, value });

describe('rankAndFold', () => {
	it('sorts largest first', () => {
		expect(rankAndFold([bar('a', 1), bar('b', 3), bar('c', 2)]).map((b) => b.label)).toEqual([
			'b',
			'c',
			'a'
		]);
	});

	it('keeps n + 1 bars rather than folding a single leftover', () => {
		const bars = Array.from({ length: TOP_N + 1 }, (_, i) => bar(`b${i}`, i));
		const out = rankAndFold(bars);
		expect(out).toHaveLength(TOP_N + 1);
		expect(out.some((b) => b.isOther)).toBe(false);
	});

	it('folds everything past the top n into one Other bar', () => {
		const bars = Array.from({ length: TOP_N + 3 }, (_, i) => bar(`b${i}`, i + 1));
		const out = rankAndFold(bars);
		expect(out).toHaveLength(TOP_N + 1);
		const other = out[out.length - 1];
		// The three smallest are 1, 2 and 3.
		expect(other).toEqual({ label: 'Other', value: 6, isOther: true, count: 3 });
	});
});

describe('buildReportChart', () => {
	it('returns null for an unknown report', () => {
		expect(buildReportChart('nope', undefined, [{ name: 'a', revenue: 1 }])).toBeNull();
	});

	it('returns null with no rows', () => {
		expect(buildReportChart('sales-by-brand', undefined, [])).toBeNull();
	});

	it('returns null when every value is zero', () => {
		expect(buildReportChart('sales-by-brand', undefined, [{ name: 'a', revenue: 0 }])).toBeNull();
	});

	it('charts revenue by name for the rep-side sales reports', () => {
		const chart = buildReportChart('sales-by-account', undefined, [
			{ name: 'Small', revenue: 10 },
			{ name: 'Big', revenue: 90 }
		]);
		expect(chart?.title).toBe('Revenue by account');
		expect(chart?.format).toBe('currency');
		expect(chart?.bars.map((b) => b.label)).toEqual(['Big', 'Small']);
	});

	it('reads repName on the brand variant of sales-by-rep', () => {
		const chart = buildReportChart('sales-by-rep', 'brand', [{ repName: 'Dana', revenue: 5 }]);
		expect(chart?.bars).toEqual([bar('Dana', 5)]);
	});

	it('rolls commission orders up to the brand', () => {
		const chart = buildReportChart('commission', undefined, [
			{ brand: 'A', brandCommission: 10 },
			{ brand: 'B', brandCommission: 4 },
			{ brand: 'A', brandCommission: 5 }
		]);
		expect(chart?.title).toBe('Commission by brand');
		expect(chart?.bars).toEqual([bar('A', 15), bar('B', 4)]);
	});

	it('orders the pipeline by workflow stage, not by value', () => {
		const chart = buildReportChart('pipeline', undefined, [
			{ status: 'shipped', total_amount: 900 },
			{ status: 'draft', total_amount: 10 },
			{ status: 'submitted', total_amount: '50' }
		]);
		expect(chart?.bars).toEqual([bar('draft', 10), bar('submitted', 50), bar('shipped', 900)]);
	});

	it('puts seasons oldest first, keeping order within a year', () => {
		const chart = buildReportChart('season-comparison', undefined, [
			{ name: 'Fall 2026', year: 2026, revenue: 5 },
			{ name: 'Spring 2026', year: 2026, revenue: 3 },
			{ name: 'Fall 2025', year: 2025, revenue: 9 }
		]);
		expect(chart?.bars.map((b) => b.label)).toEqual(['Fall 2025', 'Fall 2026', 'Spring 2026']);
	});

	it('charts sell-through as a percent in the server order', () => {
		const chart = buildReportChart('season-sell-through', 'brand', [
			{ seasonName: 'SS26', sellThroughPct: 40 },
			{ seasonName: 'FW26', sellThroughPct: 75 }
		]);
		expect(chart?.format).toBe('percent');
		expect(chart?.bars).toEqual([bar('SS26', 40), bar('FW26', 75)]);
	});

	it('labels brand territory coverage with its agency', () => {
		const chart = buildReportChart('territory-coverage', 'brand', [
			{ territoryName: 'West', agencyName: 'North Co', revenue: 1 }
		]);
		expect(chart?.bars[0].label).toBe('West (North Co)');
	});

	it('falls back to the style number when a product has no name', () => {
		const chart = buildReportChart('product-performance', undefined, [
			{ styleNumber: 'ST-1', revenue: 2 }
		]);
		expect(chart?.bars[0].label).toBe('ST-1');
	});

	it.each(['territory-coverage', 'account-penetration', 'season-sell-through'])(
		'draws nothing for the brand-only %s without the brand variant',
		(report) => {
			expect(buildReportChart(report, undefined, [{ revenue: 1 }])).toBeNull();
		}
	);
});
