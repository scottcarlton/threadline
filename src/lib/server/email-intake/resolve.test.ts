import { describe, it, expect } from 'vitest';
import { parseShipDate, parseShipWindow } from './resolve.js';

// Use a fixed reference date: April 18, 2026
const REF = new Date('2026-04-18');

describe('parseShipDate', () => {
	it('parses M/D format with same-year month', () => {
		expect(parseShipDate('5/20', REF)).toBe('2026-05-20');
	});

	it('parses M/D format — earlier month wraps to next year', () => {
		expect(parseShipDate('2/15', REF)).toBe('2027-02-15');
	});

	it('parses M/D/YY format', () => {
		expect(parseShipDate('5/20/26', REF)).toBe('2026-05-20');
	});

	it('parses M/D/YYYY format', () => {
		expect(parseShipDate('5/20/2026', REF)).toBe('2026-05-20');
	});

	it('parses MMM D format', () => {
		expect(parseShipDate('May 20', REF)).toBe('2026-05-20');
	});

	it('parses full month name', () => {
		expect(parseShipDate('January 5', REF)).toBe('2027-01-05');
	});

	it('returns null for empty input', () => {
		expect(parseShipDate(null, REF)).toBeNull();
		expect(parseShipDate('', REF)).toBeNull();
	});

	it('returns null for unrecognized format', () => {
		expect(parseShipDate('next tuesday', REF)).toBeNull();
	});

	it('handles current month as same year', () => {
		expect(parseShipDate('4/30', REF)).toBe('2026-04-30');
	});
});

describe('parseShipWindow', () => {
	it('parses start and end dates', () => {
		const result = parseShipWindow({ start: '5/20', end: '6/20' }, REF);
		expect(result).toEqual({ start: '2026-05-20', end: '2026-06-20' });
	});

	it('handles null window', () => {
		expect(parseShipWindow(null, REF)).toEqual({ start: null, end: null });
	});

	it('handles partial window (start only)', () => {
		const result = parseShipWindow({ start: '5/20', end: null }, REF);
		expect(result).toEqual({ start: '2026-05-20', end: null });
	});

	it('handles partial window (end only)', () => {
		const result = parseShipWindow({ start: null, end: '6/20' }, REF);
		expect(result).toEqual({ start: null, end: '2026-06-20' });
	});
});
