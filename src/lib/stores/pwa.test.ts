// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));

describe('pwa store', () => {
	beforeEach(() => {
		vi.resetModules();
		Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
		// matchMedia stub for isStandalone detection
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn()
		}));
	});

	it('isOnline reflects navigator.onLine on init', async () => {
		Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
		const { isOnline } = await import('./pwa.js');
		expect(get(isOnline)).toBe(false);
	});

	it('isOnline updates on online event', async () => {
		Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
		const { isOnline } = await import('./pwa.js');
		expect(get(isOnline)).toBe(false);
		Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
		window.dispatchEvent(new Event('online'));
		expect(get(isOnline)).toBe(true);
	});

	it('isOnline updates on offline event', async () => {
		const { isOnline } = await import('./pwa.js');
		expect(get(isOnline)).toBe(true);
		Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
		window.dispatchEvent(new Event('offline'));
		expect(get(isOnline)).toBe(false);
	});

	it('captures beforeinstallprompt event', async () => {
		const { installPromptEvent } = await import('./pwa.js');
		expect(get(installPromptEvent)).toBeNull();
		const fakeEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
			prompt: () => Promise<void>;
		};
		fakeEvent.prompt = vi.fn();
		window.dispatchEvent(fakeEvent);
		expect(fakeEvent.defaultPrevented).toBe(true);
		expect(get(installPromptEvent)).toBe(fakeEvent);
	});

	it('resets installPromptEvent on appinstalled', async () => {
		const { installPromptEvent } = await import('./pwa.js');
		const fakeEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
			prompt: () => Promise<void>;
		};
		fakeEvent.prompt = vi.fn();
		window.dispatchEvent(fakeEvent);
		expect(get(installPromptEvent)).toBe(fakeEvent);
		window.dispatchEvent(new Event('appinstalled'));
		expect(get(installPromptEvent)).toBeNull();
	});

	it('isStandalone is false when not in standalone display mode', async () => {
		const { isStandalone } = await import('./pwa.js');
		expect(get(isStandalone)).toBe(false);
	});
});
