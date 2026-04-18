import { describe, it, expect } from 'vitest';
import { classifyTrend, buildProductPerformanceRows } from './productPerformance';

describe('classifyTrend', () => {
	it('returns "up" when current exceeds prior by >10%', () => {
		expect(classifyTrend(110, 100)).toBe('up');
		expect(classifyTrend(200, 100)).toBe('up');
	});

	it('returns "down" when current trails prior by >10%', () => {
		expect(classifyTrend(80, 100)).toBe('down');
		expect(classifyTrend(0, 100)).toBe('down');
	});

	it('returns "flat" when change is within +/- 10%', () => {
		expect(classifyTrend(100, 100)).toBe('flat');
		expect(classifyTrend(105, 100)).toBe('flat');
		expect(classifyTrend(95, 100)).toBe('flat');
	});

	it('returns "up" when prior is zero and current is positive (new style)', () => {
		expect(classifyTrend(10, 0)).toBe('up');
	});

	it('returns "flat" when both zero', () => {
		expect(classifyTrend(0, 0)).toBe('flat');
	});
});

describe('buildProductPerformanceRows', () => {
	it('joins current and prior windows on style_number, computes velocity and trend', () => {
		const current = [
			{
				style_number: 'S-1',
				product_name: 'Alpha',
				brand_name: 'B',
				account_count: 5,
				order_count: 8,
				total_qty: 100,
				total_revenue: 1000,
				avg_qty_per_account: 20
			}
		];
		const prior = [
			{
				style_number: 'S-1',
				product_name: 'Alpha',
				brand_name: 'B',
				account_count: 4,
				order_count: 6,
				total_qty: 80,
				total_revenue: 800,
				avg_qty_per_account: 20
			}
		];
		const rows = buildProductPerformanceRows(current, prior);
		expect(rows).toHaveLength(1);
		expect(rows[0].styleNumber).toBe('S-1');
		expect(rows[0].velocityScore).toBe(100); // 5 * 20
		expect(rows[0].trend).toBe('up'); // 100 vs 80 = +25%
	});

	it('treats prior-only styles as dropped (trend down, unitsOrdered=0)', () => {
		const current: Parameters<typeof buildProductPerformanceRows>[0] = [];
		const prior = [
			{
				style_number: 'S-2',
				product_name: 'Beta',
				brand_name: 'B',
				account_count: 3,
				order_count: 5,
				total_qty: 50,
				total_revenue: 500,
				avg_qty_per_account: 16.7
			}
		];
		const rows = buildProductPerformanceRows(current, prior);
		expect(rows).toHaveLength(1);
		expect(rows[0].styleNumber).toBe('S-2');
		expect(rows[0].unitsOrdered).toBe(0);
		expect(rows[0].trend).toBe('down');
	});

	it('sorts rows by velocityScore desc', () => {
		const current = [
			{
				style_number: 'LOW',
				product_name: 'Low',
				brand_name: 'B',
				account_count: 1,
				order_count: 1,
				total_qty: 10,
				total_revenue: 100,
				avg_qty_per_account: 10
			},
			{
				style_number: 'HIGH',
				product_name: 'High',
				brand_name: 'B',
				account_count: 5,
				order_count: 5,
				total_qty: 100,
				total_revenue: 1000,
				avg_qty_per_account: 20
			}
		];
		const rows = buildProductPerformanceRows(current, []);
		expect(rows[0].styleNumber).toBe('HIGH');
		expect(rows[1].styleNumber).toBe('LOW');
	});
});
