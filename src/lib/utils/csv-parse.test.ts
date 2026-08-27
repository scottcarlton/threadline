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

describe('parseCSV — multi-line quoted fields', () => {
	it('keeps a newline inside a quoted field in one record', () => {
		const text = 'style,description,price\nST-1,"line one\nline two",120\nST-2,plain,90';
		const { rows } = parseCSV(text);
		expect(rows).toHaveLength(2);
		expect(rows[0].description).toBe('line one\nline two');
		expect(rows[0].price).toBe('120');
		expect(rows[1].style).toBe('ST-2');
	});

	it('does not let an embedded newline shift later columns', () => {
		// The old line-based splitter produced a phantom record here and every
		// column after the description came back misaligned.
		const text = 'style,description,price\nST-1,"a\n\nb\nc",120';
		const { rows } = parseCSV(text);
		expect(rows).toHaveLength(1);
		expect(rows[0].price).toBe('120');
	});

	it('handles CRLF and a missing trailing newline', () => {
		const { rows } = parseCSV('a,b\r\n1,2\r\n3,4');
		expect(rows).toEqual([
			{ a: '1', b: '2' },
			{ a: '3', b: '4' }
		]);
	});

	it('unescapes doubled quotes inside a quoted field', () => {
		const { rows } = parseCSV('a,b\n"say ""hi""",2');
		expect(rows[0].a).toBe('say "hi"');
	});

	it('ignores a trailing newline instead of emitting a blank row', () => {
		const { rows } = parseCSV('a,b\n1,2\n');
		expect(rows).toHaveLength(1);
	});
});

describe('parseCSV — unquoted quote characters', () => {
	it('treats an inch mark mid-field as literal, not as an opening quote', () => {
		// Regression: once quote state carried across line breaks, a stray `"`
		// mid-field swallowed the entire rest of the document.
		const text = 'style,name,wholesale\nA1,5" heel boot,100\nA2,Tee,10\nA3,Hat,12';
		const { rows } = parseCSV(text);
		expect(rows).toHaveLength(3);
		expect(rows[0].name).toBe('5" heel boot');
		expect(rows[0].wholesale).toBe('100');
		expect(rows[2].style).toBe('A3');
	});

	it('keeps a quote that follows a closing quote in the same field', () => {
		const { rows } = parseCSV('a,b\n"quoted"extra,2');
		expect(rows[0].a).toBe('quotedextra');
		expect(rows[0].b).toBe('2');
	});

	it('still honours a genuine quoted field containing a comma', () => {
		const { rows } = parseCSV('a,b\n"one, two",3');
		expect(rows[0].a).toBe('one, two');
		expect(rows[0].b).toBe('3');
	});
});
