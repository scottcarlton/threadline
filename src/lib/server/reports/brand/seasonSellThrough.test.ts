import { describe, it, expect } from 'vitest';
import { computeSellThroughPct, mapSeasonSellThroughRow } from './seasonSellThrough';

describe('computeSellThroughPct', () => {
	it('returns 0 when there are no products in the season', () => {
		expect(computeSellThroughPct(0, 0)).toBe(0);
		expect(computeSellThroughPct(5, 0)).toBe(0);
	});

	it('rounds to a whole percentage', () => {
		expect(computeSellThroughPct(1, 3)).toBe(33);
		expect(computeSellThroughPct(2, 3)).toBe(67);
	});

	it('returns 100 when all products have sold', () => {
		expect(computeSellThroughPct(10, 10)).toBe(100);
	});
});

describe('mapSeasonSellThroughRow', () => {
	const base = {
		season_id: 's-1',
		season_name: 'Spring 2026',
		sort_order: 1,
		is_active: true,
		products_in_season: 20,
		products_ordered: 5,
		total_units: 120,
		total_revenue: 18000,
		order_count: 4,
		account_count: 3
	};

	it('maps a typical row and computes sell-through', () => {
		const row = mapSeasonSellThroughRow(base);
		expect(row).toMatchObject({
			seasonName: 'Spring 2026',
			productsInSeason: 20,
			productsOrdered: 5,
			sellThroughPct: 25,
			totalUnits: 120,
			totalRevenue: 18000,
			orders: 4,
			accounts: 3
		});
	});

	it('handles a zero-catalog season without dividing by zero', () => {
		const row = mapSeasonSellThroughRow({
			...base,
			products_in_season: 0,
			products_ordered: 0
		});
		expect(row.sellThroughPct).toBe(0);
	});

	it('coerces numeric strings from Postgres BIGINT / NUMERIC', () => {
		const row = mapSeasonSellThroughRow({
			...base,
			products_in_season: '40' as unknown as number,
			products_ordered: '10' as unknown as number,
			total_units: '240' as unknown as number,
			total_revenue: '36000.00' as unknown as number,
			order_count: '8' as unknown as number,
			account_count: '6' as unknown as number
		});
		expect(row.productsInSeason).toBe(40);
		expect(row.sellThroughPct).toBe(25);
		expect(row.totalRevenue).toBe(36000);
	});
});
