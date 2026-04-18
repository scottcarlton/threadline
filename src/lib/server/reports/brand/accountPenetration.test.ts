import { describe, it, expect } from 'vitest';
import { classifyAccountTrend, mapAccountPenetrationRow } from './accountPenetration';

describe('classifyAccountTrend', () => {
	it('up when current exceeds prior by >10%', () => {
		expect(classifyAccountTrend(1100, 1000)).toBe('up');
	});

	it('down when current trails prior by >10%', () => {
		expect(classifyAccountTrend(800, 1000)).toBe('down');
	});

	it('flat within +/- 10%', () => {
		expect(classifyAccountTrend(1050, 1000)).toBe('flat');
		expect(classifyAccountTrend(950, 1000)).toBe('flat');
	});

	it('up when prior is zero and current is positive (new account)', () => {
		expect(classifyAccountTrend(500, 0)).toBe('up');
	});

	it('flat when both are zero (dormant both years)', () => {
		expect(classifyAccountTrend(0, 0)).toBe('flat');
	});
});

describe('mapAccountPenetrationRow', () => {
	const base = {
		account_id: 'a-1',
		business_name: 'Bloom Boutique',
		agency_org_id: 'o-1',
		agency_name: 'ACME',
		source: 'agency' as const,
		current_orders: 3,
		current_revenue: 5000,
		prior_revenue: 4000,
		last_order_date: '2026-03-01T00:00:00Z',
		has_access: true
	};

	it('marks row active when current_orders > 0 and sets an up trend', () => {
		const row = mapAccountPenetrationRow(base);
		expect(row.status).toBe('active');
		expect(row.trend).toBe('up');
		expect(row.currentRevenue).toBe(5000);
	});

	it('marks row dormant when no current-year orders', () => {
		const row = mapAccountPenetrationRow({
			...base,
			current_orders: 0,
			current_revenue: 0,
			prior_revenue: 2000
		});
		expect(row.status).toBe('dormant');
		expect(row.trend).toBe('down');
	});

	it('coerces numeric strings and null last_order_date', () => {
		const row = mapAccountPenetrationRow({
			...base,
			current_orders: '0' as unknown as number,
			current_revenue: '0.00' as unknown as number,
			prior_revenue: '0.00' as unknown as number,
			last_order_date: null
		});
		expect(row.currentOrders).toBe(0);
		expect(row.currentRevenue).toBe(0);
		expect(row.lastOrderDate).toBeNull();
		expect(row.status).toBe('dormant');
	});
});
