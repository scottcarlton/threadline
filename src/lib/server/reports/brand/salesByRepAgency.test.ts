import { describe, it, expect } from 'vitest';
import { computeRepAgencyRow } from './salesByRepAgency';

describe('computeRepAgencyRow', () => {
	it('returns zeros and inactive status when there are no orders', () => {
		const row = computeRepAgencyRow({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: []
		});
		expect(row).toEqual({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: 0,
			revenue: 0,
			avgOrderValue: 0,
			lastOrderDate: null,
			status: 'inactive'
		});
	});

	it('aggregates orders and marks active', () => {
		const row = computeRepAgencyRow({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: [
				{ total_amount: 100, created_at: '2026-02-01T00:00:00Z' },
				{ total_amount: 300, created_at: '2026-04-10T00:00:00Z' }
			]
		});
		expect(row.orders).toBe(2);
		expect(row.revenue).toBe(400);
		expect(row.avgOrderValue).toBe(200);
		expect(row.lastOrderDate).toBe('2026-04-10T00:00:00Z');
		expect(row.status).toBe('active');
	});

	it('guards divide-by-zero on AOV', () => {
		const row = computeRepAgencyRow({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: []
		});
		expect(row.avgOrderValue).toBe(0);
	});

	it('coerces string total_amount values', () => {
		const row = computeRepAgencyRow({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: [{ total_amount: '250.50' as unknown as number, created_at: '2026-03-01T00:00:00Z' }]
		});
		expect(row.revenue).toBe(250.5);
		expect(row.orders).toBe(1);
	});
});
