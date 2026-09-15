import { describe, it, expect } from 'vitest';
import { sanitizeSizeQtys, sanitizeSelectedColor } from './cart.js';

describe('sanitizeSizeQtys', () => {
	it('keeps positive integer quantities', () => {
		expect(sanitizeSizeQtys({ S: 2, M: 5 })).toEqual({ S: 2, M: 5 });
	});

	it('drops zero and negative quantities instead of storing them', () => {
		expect(sanitizeSizeQtys({ S: 0, M: -3, L: 1 })).toEqual({ L: 1 });
	});

	it('floors fractional quantities', () => {
		expect(sanitizeSizeQtys({ S: 2.9 })).toEqual({ S: 2 });
	});

	it('drops non-numeric, NaN and Infinity quantities', () => {
		expect(sanitizeSizeQtys({ S: '4', M: NaN, L: Infinity, XL: null })).toEqual({});
	});

	it('trims size labels and drops empty ones', () => {
		expect(sanitizeSizeQtys({ '  M  ': 3, '   ': 2 })).toEqual({ M: 3 });
	});

	it('returns an empty map for non-objects and arrays', () => {
		expect(sanitizeSizeQtys(null)).toEqual({});
		expect(sanitizeSizeQtys(undefined)).toEqual({});
		expect(sanitizeSizeQtys('S:2')).toEqual({});
		expect(sanitizeSizeQtys([['S', 2]])).toEqual({});
	});

	it('caps the number of sizes in one line', () => {
		const huge = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`size-${i}`, 1]));
		expect(Object.keys(sanitizeSizeQtys(huge))).toHaveLength(50);
	});

	it('caps an absurd quantity rather than rejecting the line', () => {
		expect(sanitizeSizeQtys({ S: 999999999 })).toEqual({ S: 100000 });
	});
});

describe('sanitizeSelectedColor', () => {
	it('trims the colour label', () => {
		expect(sanitizeSelectedColor('  Black  ')).toBe('Black');
	});

	it('round-trips empty string for products with no colourways', () => {
		expect(sanitizeSelectedColor('')).toBe('');
	});

	it('falls back to empty string for non-strings', () => {
		expect(sanitizeSelectedColor(null)).toBe('');
		expect(sanitizeSelectedColor(42)).toBe('');
	});

	it('truncates an over-long label', () => {
		expect(sanitizeSelectedColor('x'.repeat(200))).toHaveLength(100);
	});
});
