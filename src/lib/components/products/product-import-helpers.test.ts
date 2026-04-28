import { describe, it, expect } from 'vitest';
import {
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
