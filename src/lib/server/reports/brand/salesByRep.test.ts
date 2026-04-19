import { describe, it, expect } from 'vitest';
import { mapSalesByRepRow } from './salesByRep';

describe('mapSalesByRepRow', () => {
	const base = {
		rep_user_id: 'u-1',
		rep_name: 'Alex Rep',
		agency_org_id: 'o-1',
		agency_name: 'ACME',
		source: 'agency' as const,
		order_count: 3,
		revenue: 1500,
		avg_order_value: 500,
		last_order_date: '2026-04-10T00:00:00Z'
	};

	it('maps an agency (MBISR) row', () => {
		expect(mapSalesByRepRow(base)).toEqual({
			repUserId: 'u-1',
			repName: 'Alex Rep',
			agencyOrgId: 'o-1',
			agencyName: 'ACME',
			source: 'agency',
			orders: 3,
			revenue: 1500,
			avgOrderValue: 500,
			lastOrderDate: '2026-04-10T00:00:00Z'
		});
	});

	it('maps an in-house (BOLSR) row', () => {
		const row = mapSalesByRepRow({ ...base, source: 'in_house', agency_name: 'Demo Brand Co' });
		expect(row.source).toBe('in_house');
		expect(row.agencyName).toBe('Demo Brand Co');
	});

	it('coerces numeric strings (Postgres NUMERIC → string over the wire)', () => {
		const row = mapSalesByRepRow({
			...base,
			order_count: '2' as unknown as number,
			revenue: '249.50' as unknown as number,
			avg_order_value: '124.75' as unknown as number
		});
		expect(row.orders).toBe(2);
		expect(row.revenue).toBe(249.5);
		expect(row.avgOrderValue).toBe(124.75);
	});

	it('preserves null last_order_date', () => {
		const row = mapSalesByRepRow({ ...base, last_order_date: null });
		expect(row.lastOrderDate).toBeNull();
	});
});
