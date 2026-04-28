import { describe, it, expect } from 'vitest';
import { parseCSV, parseCSVLine } from './csv-parse.js';

describe('parseCSVLine', () => {
	it('splits a simple comma-separated line', () => {
		expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
	});

	it('handles double-quoted fields with embedded commas', () => {
		expect(parseCSVLine('"hello, world",foo,"bar"')).toEqual(['hello, world', 'foo', 'bar']);
	});

	it('unescapes "" inside quoted fields', () => {
		expect(parseCSVLine('"she said ""hi""",ok')).toEqual(['she said "hi"', 'ok']);
	});

	it('returns empty strings for empty fields', () => {
		expect(parseCSVLine('a,,b,')).toEqual(['a', '', 'b', '']);
	});

	it('handles a single-field line', () => {
		expect(parseCSVLine('only')).toEqual(['only']);
	});
});

describe('parseCSV', () => {
	it('returns empty when fewer than 2 lines', () => {
		expect(parseCSV('header_only')).toEqual({ headers: [], rows: [] });
		expect(parseCSV('')).toEqual({ headers: [], rows: [] });
	});

	it('parses a standard CSV with a header row', () => {
		const text = `name,style_number,wholesale_price
Crew Tee,CT-01,24.00
Linen Shirt,LS-22,32.00`;

		const result = parseCSV(text);
		expect(result.headers).toEqual(['name', 'style_number', 'wholesale_price']);
		expect(result.rows).toEqual([
			{ name: 'Crew Tee', style_number: 'CT-01', wholesale_price: '24.00' },
			{ name: 'Linen Shirt', style_number: 'LS-22', wholesale_price: '32.00' }
		]);
	});

	it('preserves original-case headers separately from lowercased row keys', () => {
		const text = `Style Number,Wholesale Price
CT-01,24.00`;

		const result = parseCSV(text);
		expect(result.headers).toEqual(['Style Number', 'Wholesale Price']);
		// Row keys are lowercased so callers can do case-insensitive lookups.
		expect(result.rows[0]).toEqual({ 'style number': 'CT-01', 'wholesale price': '24.00' });
	});

	it('handles quoted fields with commas in the data', () => {
		const text = `name,description
"Linen Shirt","Soft, breathable, classic"
Crew Tee,Standard fit`;

		const result = parseCSV(text);
		expect(result.rows[0].description).toBe('Soft, breathable, classic');
		expect(result.rows[1].description).toBe('Standard fit');
	});

	it('skips blank lines', () => {
		const text = `name,sku
Crew Tee,CT-01

Linen Shirt,LS-22
`;
		const result = parseCSV(text);
		expect(result.rows).toHaveLength(2);
	});

	it('right-pads short rows with empty strings', () => {
		const text = `name,sku,price
Crew Tee,CT-01`;
		const result = parseCSV(text);
		expect(result.rows[0]).toEqual({ name: 'Crew Tee', sku: 'CT-01', price: '' });
	});
});
