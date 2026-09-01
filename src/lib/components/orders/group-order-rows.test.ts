import { describe, it, expect } from 'vitest';
import { groupOrderRows } from './group-order-rows.js';

describe('groupOrderRows', () => {
	it('groups rows by account (case-insensitive)', () => {
		const rows = [
			{
				account: 'Acme Boutique',
				style_number: 'CT-01',
				qty: 5,
				unit_price: null,
				color: null,
				size: null,
				expected_ship_date: null,
				notes: null
			},
			{
				account: 'acme boutique',
				style_number: 'CT-02',
				qty: 3,
				unit_price: null,
				color: null,
				size: null,
				expected_ship_date: null,
				notes: null
			},
			{
				account: 'Beta Store',
				style_number: 'CT-01',
				qty: 2,
				unit_price: null,
				color: null,
				size: null,
				expected_ship_date: null,
				notes: null
			}
		];
		const groups = groupOrderRows(rows);
		expect(groups).toHaveLength(2);
		expect(groups[0].account).toBe('Acme Boutique');
		expect(groups[0].lines).toHaveLength(2);
		expect(groups[1].account).toBe('Beta Store');
		expect(groups[1].lines).toHaveLength(1);
	});

	it('preserves first-seen account casing', () => {
		const rows = [
			{
				account: 'ACME',
				style_number: 'X',
				qty: 1,
				unit_price: null,
				color: null,
				size: null,
				expected_ship_date: null,
				notes: null
			},
			{
				account: 'Acme',
				style_number: 'Y',
				qty: 1,
				unit_price: null,
				color: null,
				size: null,
				expected_ship_date: null,
				notes: null
			}
		];
		const groups = groupOrderRows(rows);
		expect(groups[0].account).toBe('ACME');
	});

	it('returns empty array for empty input', () => {
		expect(groupOrderRows([])).toEqual([]);
	});
});
