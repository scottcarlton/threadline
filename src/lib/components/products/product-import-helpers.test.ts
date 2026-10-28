import { describe, it, expect } from 'vitest';
import {
	buildPreviewFromCsv,
	detectHintFromText,
	detectHintFromCsvRows,
	matchSeasonId,
	mergeHints,
	yearOptions
} from './product-import-helpers.js';

describe('detectHintFromText', () => {
	it('parses fashion shorthand FA26', () => {
		expect(detectHintFromText('FA26_Linesheet.pdf')).toEqual({ seasonName: 'Fall', year: 2026 });
	});

	it('parses FW with two-digit year', () => {
		expect(detectHintFromText('FW25.pdf')).toEqual({ seasonName: 'Fall', year: 2025 });
	});

	it('parses Spring with explicit four-digit year and dash', () => {
		expect(detectHintFromText('SS-2026 Spring Lookbook.pdf')).toEqual({
			seasonName: 'Spring',
			year: 2026
		});
	});

	it('parses Resort with underscore separator', () => {
		expect(detectHintFromText('Resort_2027.pdf')).toEqual({
			seasonName: 'Resort',
			year: 2027
		});
	});

	it('parses Holiday shorthand HO26', () => {
		expect(detectHintFromText('HO26_catalog.csv')).toEqual({
			seasonName: 'Holiday',
			year: 2026
		});
	});

	it('falls back to bare 4-digit year when no season pattern matches', () => {
		expect(detectHintFromText('catalog_2026.pdf')).toEqual({ seasonName: null, year: 2026 });
	});

	it('returns nulls when no pattern matches', () => {
		expect(detectHintFromText('random.pdf')).toEqual({ seasonName: null, year: null });
	});

	it('handles empty input', () => {
		expect(detectHintFromText('')).toEqual({ seasonName: null, year: null });
	});

	it('is case-insensitive', () => {
		expect(detectHintFromText('fa26_linesheet.pdf')).toEqual({
			seasonName: 'Fall',
			year: 2026
		});
	});
});

describe('detectHintFromCsvRows', () => {
	it('reads season + year from first row', () => {
		const rows = [
			{ name: 'A', season: 'Fall', product_year: 2026 },
			{ name: 'B', season: 'Fall', product_year: 2026 }
		];
		expect(detectHintFromCsvRows(rows)).toEqual({ seasonName: 'Fall', year: 2026 });
	});

	it('coerces string year', () => {
		const rows = [{ season: 'Spring', product_year: '2026' }];
		expect(detectHintFromCsvRows(rows)).toEqual({ seasonName: 'Spring', year: 2026 });
	});

	it('handles missing fields', () => {
		expect(detectHintFromCsvRows([{}])).toEqual({ seasonName: null, year: null });
	});

	it('handles empty rows', () => {
		expect(detectHintFromCsvRows([])).toEqual({ seasonName: null, year: null });
	});
});

describe('mergeHints', () => {
	it('takes first non-null per field independently', () => {
		expect(
			mergeHints({ seasonName: 'Fall', year: null }, { seasonName: null, year: 2026 })
		).toEqual({ seasonName: 'Fall', year: 2026 });
	});

	it('first source wins when both supply same field', () => {
		expect(
			mergeHints({ seasonName: 'Fall', year: 2025 }, { seasonName: 'Spring', year: 2026 })
		).toEqual({ seasonName: 'Fall', year: 2025 });
	});

	it('returns nulls when no source has anything', () => {
		expect(mergeHints({ seasonName: null, year: null })).toEqual({
			seasonName: null,
			year: null
		});
	});
});

describe('matchSeasonId', () => {
	const seasons = [
		{ id: 'spr', name: 'Spring' },
		{ id: 'fal', name: 'Fall' },
		{ id: 'res', name: 'Resort' }
	];

	it('returns id on exact case-insensitive name match', () => {
		expect(matchSeasonId('Fall', seasons)).toBe('fal');
	});

	it('matches when detected name is a substring of season name', () => {
		expect(matchSeasonId('Spr', seasons)).toBe('spr');
	});

	it('matches when season name is a substring of detected name', () => {
		expect(matchSeasonId('Fall 2026', seasons)).toBe('fal');
	});

	it('returns null when nothing matches', () => {
		expect(matchSeasonId('Holiday', seasons)).toBeNull();
	});

	it('returns null on empty input', () => {
		expect(matchSeasonId(null, seasons)).toBeNull();
		expect(matchSeasonId('', seasons)).toBeNull();
	});
});

describe('yearOptions', () => {
	it('returns 5 years centered on the current year', () => {
		const opts = yearOptions();
		const current = new Date().getFullYear();
		expect(opts).toEqual([current - 2, current - 1, current, current + 1, current + 2]);
	});
});

// Mirrors parseCSV: rows keyed by lowercased header.
function sheet(headers: string[], body: string[][]) {
	const rows = body.map((cells) =>
		Object.fromEntries(headers.map((h, i) => [h.toLowerCase(), cells[i] ?? '']))
	);
	return buildPreviewFromCsv(headers, rows);
}

describe('buildPreviewFromCsv', () => {
	it('keeps one row per product for the template shape', () => {
		const { previewRows } = sheet(
			['style_number', 'name', 'wholesale_price', 'sizes', 'colors'],
			[
				['CT-01', 'Crew Tee', '24.00', 'XS, S, M', 'Black, White'],
				['CT-02', 'Boxy Tee', '26.00', 'S, M', 'Oat']
			]
		);
		expect(previewRows).toHaveLength(2);
		expect(previewRows[0]).toMatchObject({
			style_number: 'CT-01',
			name: 'Crew Tee',
			wholesale_price: '24.00',
			sizes: ['XS', 'S', 'M'],
			colors: ['Black', 'White']
		});
		expect(previewRows[0].variants).toBeUndefined();
	});

	it('groups one-row-per-variant files into one product with SKU variants', () => {
		const { previewRows, previewUnmapped } = sheet(
			['Style Number', 'Name', 'Wholesale Price', 'Size', 'Color', 'SKU'],
			[
				['XV-201', 'Crew Tee', '24', 'S', 'Oat', 'XV-201-OAT-S'],
				['XV-201', 'Crew Tee', '24', 'M', 'Oat', 'XV-201-OAT-M'],
				['XV-201', 'Crew Tee', '24', 'L', 'Oat', 'XV-201-OAT-L'],
				['XV-202', 'Boxy Tee', '26', 'M', 'Black', 'XV-202-BLK-M']
			]
		);
		expect(previewRows).toHaveLength(2);
		expect(previewRows[0]).toMatchObject({
			style_number: 'XV-201',
			sizes: ['S', 'M', 'L'],
			colors: ['Oat'],
			variants: [
				{ size: 'S', color: 'Oat', sku: 'XV-201-OAT-S' },
				{ size: 'M', color: 'Oat', sku: 'XV-201-OAT-M' },
				{ size: 'L', color: 'Oat', sku: 'XV-201-OAT-L' }
			]
		});
		expect(previewRows[1]).toMatchObject({ style_number: 'XV-202', sizes: ['M'] });
		expect(previewUnmapped).toEqual([]);
	});

	it('groups variant rows without a SKU column and lets the server cross sizes and colors', () => {
		const { previewRows } = sheet(
			['Style Number', 'Name', 'Wholesale Price', 'Size', 'Color'],
			[
				['XV-201', 'Crew Tee', '24', 'S', 'Oat'],
				['XV-201', 'Crew Tee', '24', 'M', 'Black']
			]
		);
		expect(previewRows).toHaveLength(1);
		expect(previewRows[0]).toMatchObject({ sizes: ['S', 'M'], colors: ['Oat', 'Black'] });
		expect(previewRows[0].variants).toBeUndefined();
	});

	it('backfills fields the first row of a style left blank', () => {
		const { previewRows } = sheet(
			['Style Number', 'Name', 'Wholesale Price', 'Size', 'Description'],
			[
				['XV-201', 'Crew Tee', '24', 'S', ''],
				['XV-201', '', '', 'M', 'Heavy cotton']
			]
		);
		expect(previewRows).toHaveLength(1);
		expect(previewRows[0]).toMatchObject({
			name: 'Crew Tee',
			wholesale_price: '24',
			description: 'Heavy cotton',
			sizes: ['S', 'M']
		});
	});

	it('uses a lone SKU column as the style number', () => {
		const { previewRows } = sheet(
			['SKU', 'Name', 'Wholesale Price'],
			[['CT-01', 'Crew Tee', '24']]
		);
		expect(previewRows[0]).toMatchObject({ style_number: 'CT-01' });
		expect(previewRows[0].variants).toBeUndefined();
	});

	it('keeps rows with no style number separate so the server can name them', () => {
		const { previewRows } = sheet(
			['Style Number', 'Name', 'Wholesale Price'],
			[
				['', 'Crew Tee', '24'],
				['', 'Boxy Tee', '26']
			]
		);
		expect(previewRows).toHaveLength(2);
	});
});
