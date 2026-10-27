import { describe, expect, it } from 'vitest';
import { isXlsxFile, sheetDataToRows } from './xlsx-parse.js';

describe('sheetDataToRows', () => {
	it('keys rows by lowercased header and keeps header case', () => {
		const out = sheetDataToRows([
			['Account', 'Style Number', 'Qty'],
			['Acme Boutique', 'CT-01', 12]
		]);
		expect(out.headers).toEqual(['Account', 'Style Number', 'Qty']);
		expect(out.rows).toEqual([{ account: 'Acme Boutique', 'style number': 'CT-01', qty: '12' }]);
	});

	it('formats date-only cells as YYYY-MM-DD', () => {
		const out = sheetDataToRows([
			['Ship Date', 'Stamp'],
			[new Date(Date.UTC(2026, 8, 15)), new Date(Date.UTC(2026, 8, 15, 14, 30))]
		]);
		expect(out.rows[0]['ship date']).toBe('2026-09-15');
		expect(out.rows[0].stamp).toBe('2026-09-15T14:30:00.000Z');
	});

	it('turns null cells and short rows into empty strings', () => {
		const out = sheetDataToRows([
			['A', 'B', 'C'],
			['x', null]
		]);
		expect(out.rows).toEqual([{ a: 'x', b: '', c: '' }]);
	});

	it('drops blank rows, including leading ones', () => {
		const out = sheetDataToRows([
			[null, null],
			['Account', 'Qty'],
			['', null],
			['Acme', 3],
			[null, '  ']
		]);
		expect(out.headers).toEqual(['Account', 'Qty']);
		expect(out.rows).toEqual([{ account: 'Acme', qty: '3' }]);
	});

	it('trims string cells and stringifies booleans', () => {
		const out = sheetDataToRows([
			['Name', 'Active'],
			['  Acme  ', true]
		]);
		expect(out.rows[0]).toEqual({ name: 'Acme', active: 'true' });
	});

	it('returns nothing when there is no data row', () => {
		expect(sheetDataToRows([['Account']])).toEqual({ headers: [], rows: [] });
		expect(sheetDataToRows([])).toEqual({ headers: [], rows: [] });
	});
});

describe('isXlsxFile', () => {
	it('matches by extension or MIME type', () => {
		expect(isXlsxFile({ name: 'orders.XLSX', type: '' })).toBe(true);
		expect(
			isXlsxFile({
				name: 'orders',
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			})
		).toBe(true);
		expect(isXlsxFile({ name: 'orders.csv', type: 'text/csv' })).toBe(false);
		expect(isXlsxFile({ name: 'orders.xls', type: 'application/vnd.ms-excel' })).toBe(false);
	});
});
