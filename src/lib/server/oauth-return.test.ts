import { describe, it, expect, vi } from 'vitest';
import { isSafeReturnPath, rememberReturnPath, takeReturnPath } from './oauth-return';
import type { Cookies } from '@sveltejs/kit';

function fakeCookies(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	const cookies = {
		get: (name: string) => store.get(name),
		set: vi.fn((name: string, value: string) => store.set(name, value)),
		delete: vi.fn((name: string) => store.delete(name))
	} as unknown as Cookies;
	return { cookies, store };
}

describe('isSafeReturnPath', () => {
	it('accepts same-origin relative paths', () => {
		expect(isSafeReturnPath('/onboarding')).toBe(true);
		expect(isSafeReturnPath('/settings?tab=email')).toBe(true);
	});

	it('rejects anything that could leave the site', () => {
		// Protocol-relative — the browser treats this as an absolute URL.
		expect(isSafeReturnPath('//evil.example.com')).toBe(false);
		expect(isSafeReturnPath('https://evil.example.com')).toBe(false);
		expect(isSafeReturnPath('/\\evil.example.com')).toBe(false);
		expect(isSafeReturnPath('onboarding')).toBe(false);
	});

	it('rejects empty and overlong values', () => {
		expect(isSafeReturnPath('')).toBe(false);
		expect(isSafeReturnPath(null)).toBe(false);
		expect(isSafeReturnPath('/' + 'x'.repeat(600))).toBe(false);
	});
});

describe('rememberReturnPath', () => {
	it('stores a safe path', () => {
		const { cookies, store } = fakeCookies();
		rememberReturnPath(cookies, '/onboarding', true);
		expect(store.get('oauth_return_to')).toBe('/onboarding');
	});

	it('ignores an unsafe path rather than storing it', () => {
		const { cookies, store } = fakeCookies();
		rememberReturnPath(cookies, '//evil.example.com', true);
		expect(store.has('oauth_return_to')).toBe(false);
	});
});

describe('takeReturnPath', () => {
	it('returns the stored path with the success marker and clears it', () => {
		const { cookies, store } = fakeCookies({ oauth_return_to: '/onboarding' });
		expect(takeReturnPath(cookies, 'email_connected=true')).toBe(
			'/onboarding?email_connected=true'
		);
		expect(store.has('oauth_return_to')).toBe(false);
	});

	it('uses & when the stored path already has a query', () => {
		const { cookies } = fakeCookies({ oauth_return_to: '/onboarding?step=3' });
		expect(takeReturnPath(cookies, 'email_connected=true')).toBe(
			'/onboarding?step=3&email_connected=true'
		);
	});

	it('falls back to settings when nothing was stored', () => {
		const { cookies } = fakeCookies();
		expect(takeReturnPath(cookies, 'outlook_connected=true')).toBe(
			'/settings?outlook_connected=true'
		);
	});

	it('falls back when the stored value is unsafe', () => {
		const { cookies } = fakeCookies({ oauth_return_to: 'https://evil.example.com' });
		expect(takeReturnPath(cookies, 'email_connected=true')).toBe('/settings?email_connected=true');
	});
});
