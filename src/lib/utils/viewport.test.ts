import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));

declare global {
	var __lgMatch: boolean;
	var __tpMatch: boolean;
}

describe('viewport utils', () => {
	let listeners: Map<string, Set<(e: MediaQueryListEvent) => void>>;

	beforeEach(() => {
		vi.resetModules();
		listeners = new Map();
		const matchMedia = (query: string) => {
			const matches =
				(query === '(min-width: 1024px)' && globalThis.__lgMatch === true) ||
				(query === '(min-width: 768px) and (max-width: 1023px)' && globalThis.__tpMatch === true);
			const set = listeners.get(query) ?? new Set();
			listeners.set(query, set);
			return {
				matches,
				media: query,
				onchange: null,
				addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => set.add(cb),
				removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => set.delete(cb),
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false
			} as MediaQueryList;
		};
		vi.stubGlobal('matchMedia', matchMedia);
		globalThis.__lgMatch = false;
		globalThis.__tpMatch = false;
	});

	it('isLgUp is false at iPad portrait widths', async () => {
		globalThis.__lgMatch = false;
		const { isLgUp } = await import('./viewport.js');
		expect(get(isLgUp)).toBe(false);
	});

	it('isLgUp is true when min-width: 1024px matches', async () => {
		globalThis.__lgMatch = true;
		const { isLgUp } = await import('./viewport.js');
		expect(get(isLgUp)).toBe(true);
	});

	it('isTabletPortrait is true at iPad portrait widths only', async () => {
		globalThis.__tpMatch = true;
		const { isTabletPortrait } = await import('./viewport.js');
		expect(get(isTabletPortrait)).toBe(true);
	});
});
