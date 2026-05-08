// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getRecent, addRecent, removeRecent, clearRecent } from './recent-searches';

beforeEach(() => {
	localStorage.clear();
});

describe('recent-searches', () => {
	it('returns empty array for fresh context', () => {
		expect(getRecent('accounts')).toEqual([]);
	});

	it('adds a term and retrieves it', () => {
		addRecent('accounts', 'Nike');
		expect(getRecent('accounts')).toEqual(['Nike']);
	});

	it('most recent term comes first', () => {
		addRecent('accounts', 'Nike');
		addRecent('accounts', 'Adidas');
		expect(getRecent('accounts')).toEqual(['Adidas', 'Nike']);
	});

	it('deduplicates — re-adding moves to front', () => {
		addRecent('accounts', 'Nike');
		addRecent('accounts', 'Adidas');
		addRecent('accounts', 'Nike');
		expect(getRecent('accounts')).toEqual(['Nike', 'Adidas']);
	});

	it('caps at 10 items', () => {
		for (let i = 0; i < 15; i++) {
			addRecent('products', `term-${i}`);
		}
		const items = getRecent('products');
		expect(items).toHaveLength(10);
		expect(items[0]).toBe('term-14');
		expect(items[9]).toBe('term-5');
	});

	it('ignores blank/whitespace-only terms', () => {
		addRecent('accounts', '   ');
		addRecent('accounts', '');
		expect(getRecent('accounts')).toEqual([]);
	});

	it('trims whitespace from terms', () => {
		addRecent('accounts', '  Nike  ');
		expect(getRecent('accounts')).toEqual(['Nike']);
	});

	it('removes a specific term', () => {
		addRecent('accounts', 'Nike');
		addRecent('accounts', 'Adidas');
		removeRecent('accounts', 'Nike');
		expect(getRecent('accounts')).toEqual(['Adidas']);
	});

	it('clears all terms for a context', () => {
		addRecent('accounts', 'Nike');
		addRecent('accounts', 'Adidas');
		clearRecent('accounts');
		expect(getRecent('accounts')).toEqual([]);
	});

	it('keeps contexts isolated', () => {
		addRecent('accounts', 'Nike');
		addRecent('products', 'T-Shirt');
		expect(getRecent('accounts')).toEqual(['Nike']);
		expect(getRecent('products')).toEqual(['T-Shirt']);
	});
});
