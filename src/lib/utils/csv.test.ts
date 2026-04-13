import { describe, it, expect } from 'vitest';
import { escapeCSVValue, generateCSVString } from './csv.js';

describe('escapeCSVValue', () => {
	it('returns empty string for null', () => {
		expect(escapeCSVValue(null)).toBe('');
	});

	it('returns empty string for undefined', () => {
		expect(escapeCSVValue(undefined)).toBe('');
	});

	it('converts numbers to string', () => {
		expect(escapeCSVValue(42)).toBe('42');
	});

	it('returns plain string as-is when no special characters', () => {
		expect(escapeCSVValue('hello')).toBe('hello');
	});

	it('wraps values containing commas in quotes', () => {
		expect(escapeCSVValue('hello, world')).toBe('"hello, world"');
	});

	it('escapes double quotes by doubling them', () => {
		expect(escapeCSVValue('say "hello"')).toBe('"say ""hello"""');
	});

	it('wraps values containing newlines in quotes', () => {
		expect(escapeCSVValue('line1\nline2')).toBe('"line1\nline2"');
	});

	it('wraps values containing carriage returns in quotes', () => {
		expect(escapeCSVValue('line1\rline2')).toBe('"line1\rline2"');
	});

	it('handles values with both commas and quotes', () => {
		expect(escapeCSVValue('a "b", c')).toBe('"a ""b"", c"');
	});

	it('converts boolean to string', () => {
		expect(escapeCSVValue(true)).toBe('true');
	});
});

describe('generateCSVString', () => {
	it('returns null for empty array', () => {
		expect(generateCSVString([])).toBeNull();
	});

	it('generates header row from first object keys', () => {
		const result = generateCSVString([{ name: 'Alice', age: 30 }]);
		const lines = result!.split('\n');

		expect(lines[0]).toBe('name,age');
	});

	it('generates data rows matching header order', () => {
		const result = generateCSVString([
			{ name: 'Alice', age: 30 },
			{ name: 'Bob', age: 25 }
		]);
		const lines = result!.split('\n');

		expect(lines).toHaveLength(3);
		expect(lines[0]).toBe('name,age');
		expect(lines[1]).toBe('Alice,30');
		expect(lines[2]).toBe('Bob,25');
	});

	it('handles missing values in subsequent rows', () => {
		const result = generateCSVString([{ a: 1, b: 2 }, { a: 3 } as Record<string, unknown>]);
		const lines = result!.split('\n');

		// b is undefined in second row → empty
		expect(lines[2]).toBe('3,');
	});

	it('escapes special characters in data values', () => {
		const result = generateCSVString([{ description: 'Red, Large', notes: 'says "hello"' }]);
		const lines = result!.split('\n');

		expect(lines[1]).toBe('"Red, Large","says ""hello"""');
	});

	it('escapes special characters in header names', () => {
		const result = generateCSVString([{ 'Name, First': 'Alice' }]);
		const lines = result!.split('\n');

		expect(lines[0]).toBe('"Name, First"');
	});
});
