import { describe, it, expect } from 'vitest';
import { suggestPrompts, MAX_SUGGESTIONS, type SuggestionContext } from './ai-suggest.js';
import { AI_SUGGESTIONS, WRITE_ROLES, type AiSuggestion } from '$lib/data/ai-suggestions.js';

const base: SuggestionContext = {
	query: '',
	path: '/dashboard',
	orgType: 'rep',
	role: 'owner',
	brandScope: null,
	entityType: null
};

const ctx = (over: Partial<SuggestionContext> = {}): SuggestionContext => ({ ...base, ...over });
const texts = (result: { text: string }[]) => result.map((r) => r.text);

describe('suggestPrompts matching', () => {
	const catalog: AiSuggestion[] = [
		{ text: 'Show me commission owed' },
		{ text: 'Commission owed by brand' }
	];

	it('offers only suggestions that start with what was typed', () => {
		const result = suggestPrompts(ctx({ query: 'commission' }), catalog);
		expect(texts(result)).toEqual(['Commission owed by brand']);
	});

	it('reports the typed run so the caller can dim it', () => {
		const [first] = suggestPrompts(ctx({ query: 'commission' }), catalog);
		expect(first).toMatchObject({ matchLength: 10 });
	});

	it('does not match a word buried mid-sentence', () => {
		// Regression: "ac" used to surface "Show me accounts by territory", which
		// reads as a search hit rather than a completion of what was typed.
		const result = suggestPrompts(ctx({ query: 'ac' }), [
			{ text: 'Show me accounts by territory' },
			{ text: 'Total order value by account this season' }
		]);
		expect(result).toEqual([]);
	});

	it('does not match mid-word', () => {
		const result = suggestPrompts(ctx({ query: 'mission' }), [{ text: 'Commission owed' }]);
		expect(result).toEqual([]);
	});

	it('is case and whitespace insensitive', () => {
		const result = suggestPrompts(ctx({ query: '  COMMISSION ' }), [{ text: 'Commission owed' }]);
		expect(texts(result)).toEqual(['Commission owed']);
	});
});

describe('suggestPrompts route handling', () => {
	const catalog: AiSuggestion[] = [
		{ text: 'Show me orders', routes: ['/orders'] },
		{ text: 'Show me products', routes: ['/products'] }
	];

	it('breaks ties in favour of the current route', () => {
		expect(texts(suggestPrompts(ctx({ query: 'show', path: '/products' }), catalog))[0]).toBe(
			'Show me products'
		);
		expect(texts(suggestPrompts(ctx({ query: 'show', path: '/orders' }), catalog))[0]).toBe(
			'Show me orders'
		);
	});

	it('does not filter out off-route matches', () => {
		const result = suggestPrompts(ctx({ query: 'show', path: '/accounts' }), catalog);
		expect(result).toHaveLength(2);
	});
});

describe('suggestPrompts gating', () => {
	it('hides write prompts from guests', () => {
		const catalog: AiSuggestion[] = [{ text: 'Create an order', roles: WRITE_ROLES }];
		expect(suggestPrompts(ctx({ query: 'create', role: 'guest' }), catalog)).toEqual([]);
		expect(suggestPrompts(ctx({ query: 'create', role: 'sales' }), catalog)).toHaveLength(1);
	});

	it('hides entries belonging to another org type', () => {
		const catalog: AiSuggestion[] = [{ text: 'Commission owed by rep', orgTypes: ['brand'] }];
		expect(suggestPrompts(ctx({ query: 'commission', orgType: 'rep' }), catalog)).toEqual([]);
		expect(suggestPrompts(ctx({ query: 'commission', orgType: 'brand' }), catalog)).toHaveLength(1);
	});

	it('hides cross-brand entries from brand-scoped users', () => {
		const catalog: AiSuggestion[] = [{ text: 'Sell-through by brand', unscopedOnly: true }];
		expect(suggestPrompts(ctx({ query: 'sell', brandScope: ['abc'] }), catalog)).toEqual([]);
		expect(suggestPrompts(ctx({ query: 'sell', brandScope: null }), catalog)).toHaveLength(1);
	});

	it('hides entity prompts unless that record is on screen', () => {
		const catalog: AiSuggestion[] = [{ text: 'Add a line to this order', entity: 'order' }];
		expect(suggestPrompts(ctx({ query: 'add' }), catalog)).toEqual([]);
		expect(suggestPrompts(ctx({ query: 'add', entityType: 'account' }), catalog)).toEqual([]);
		expect(suggestPrompts(ctx({ query: 'add', entityType: 'order' }), catalog)).toHaveLength(1);
	});
});

describe('suggestPrompts bounds', () => {
	it('returns nothing below the minimum query length', () => {
		expect(suggestPrompts(ctx({ query: 'w' }))).toEqual([]);
		expect(suggestPrompts(ctx({ query: '' }))).toEqual([]);
	});

	it('never returns more rows than the panel shows', () => {
		const catalog: AiSuggestion[] = Array.from({ length: 20 }, (_, i) => ({
			text: `Show me item ${i}`
		}));
		expect(suggestPrompts(ctx({ query: 'show' }), catalog)).toHaveLength(MAX_SUGGESTIONS);
	});

	it('matches against the real catalog', () => {
		const result = suggestPrompts(ctx({ query: 'which', path: '/reports' }));
		expect(result.length).toBeGreaterThan(0);
		expect(result.every((r) => r.text.toLowerCase().includes('which'))).toBe(true);
	});

	it('offers no write prompts anywhere in the real catalog for guests', () => {
		const writeEntries = AI_SUGGESTIONS.filter((e) => e.roles === WRITE_ROLES);
		expect(writeEntries.length).toBeGreaterThan(0);
		for (const entry of writeEntries) {
			const result = suggestPrompts(ctx({ query: entry.text.slice(0, 6), role: 'guest' }));
			expect(texts(result)).not.toContain(entry.text);
		}
	});
});
