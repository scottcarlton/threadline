import { describe, it, expect } from 'vitest';
import { mapTerritoryCoverageRow } from './territoryCoverage';

describe('mapTerritoryCoverageRow', () => {
	const base = {
		agency_org_id: 'o-1',
		agency_name: 'ACME',
		source: 'agency' as const,
		territory_id: 't-1',
		territory_name: 'Midwest',
		account_count: 5,
		order_count: 12,
		revenue: 45000
	};

	it('maps an agency row', () => {
		expect(mapTerritoryCoverageRow(base)).toEqual({
			agencyOrgId: 'o-1',
			agencyName: 'ACME',
			source: 'agency',
			territoryId: 't-1',
			territoryName: 'Midwest',
			accounts: 5,
			orders: 12,
			revenue: 45000
		});
	});

	it('maps an in-house row', () => {
		const row = mapTerritoryCoverageRow({ ...base, source: 'in_house', agency_name: 'Demo Brand' });
		expect(row.source).toBe('in_house');
		expect(row.agencyName).toBe('Demo Brand');
	});

	it('preserves a null territory (unassigned accounts)', () => {
		const row = mapTerritoryCoverageRow({
			...base,
			territory_id: null,
			territory_name: 'Unassigned'
		});
		expect(row.territoryId).toBeNull();
		expect(row.territoryName).toBe('Unassigned');
	});

	it('coerces numeric strings from Postgres NUMERIC', () => {
		const row = mapTerritoryCoverageRow({
			...base,
			account_count: '3' as unknown as number,
			order_count: '7' as unknown as number,
			revenue: '12345.67' as unknown as number
		});
		expect(row.accounts).toBe(3);
		expect(row.orders).toBe(7);
		expect(row.revenue).toBe(12345.67);
	});
});
