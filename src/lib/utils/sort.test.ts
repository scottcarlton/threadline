import { describe, it, expect } from 'vitest';
import { parseSort, serializeSort, toggleSort } from './sort.js';

describe('parseSort', () => {
	it('returns default for null/empty', () => {
		expect(parseSort(null)).toEqual({ field: 'created_at', ascending: false });
		expect(parseSort('')).toEqual({ field: 'created_at', ascending: false });
	});

	it('parses ascending field', () => {
		expect(parseSort('business_name')).toEqual({ field: 'business_name', ascending: true });
	});

	it('parses descending field with leading dash', () => {
		expect(parseSort('-state')).toEqual({ field: 'state', ascending: false });
	});

	it('rejects unknown fields', () => {
		expect(parseSort('unknown_column')).toEqual({ field: 'created_at', ascending: false });
		expect(parseSort('-hacked')).toEqual({ field: 'created_at', ascending: false });
	});
});

describe('serializeSort', () => {
	it('returns empty string for default sort', () => {
		expect(serializeSort({ field: 'created_at', ascending: false })).toBe('');
	});

	it('serializes ascending', () => {
		expect(serializeSort({ field: 'business_name', ascending: true })).toBe('business_name');
	});

	it('serializes descending with dash prefix', () => {
		expect(serializeSort({ field: 'state', ascending: false })).toBe('-state');
	});
});

describe('toggleSort', () => {
	it('flips direction when same field', () => {
		expect(toggleSort({ field: 'state', ascending: true }, 'state')).toEqual({
			field: 'state',
			ascending: false
		});
	});

	it('defaults to ascending for name/state fields', () => {
		expect(toggleSort({ field: 'created_at', ascending: false }, 'business_name')).toEqual({
			field: 'business_name',
			ascending: true
		});
	});

	it('defaults to descending for created_at', () => {
		expect(toggleSort({ field: 'business_name', ascending: true }, 'created_at')).toEqual({
			field: 'created_at',
			ascending: false
		});
	});
});
