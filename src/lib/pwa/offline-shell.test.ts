import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	OFFLINE_ROUTES,
	isCacheablePage,
	keepOnSignOut,
	offlineRouteFor,
	precacheList
} from './offline-shell';

const page = (over: Partial<Parameters<typeof isCacheablePage>[0]> = {}) => ({
	ok: true,
	redirected: false,
	type: 'basic',
	headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
	...over
});

describe('precacheList', () => {
	it('takes the whole build and leaves out heavy marketing assets', () => {
		expect(
			precacheList(
				['/_app/immutable/a.js', '/_app/immutable/b.css'],
				['/offline.html', '/icons/icon-192.png', '/marketing/hero.webp', '/seed-images/x.jpg']
			)
		).toEqual([
			'/_app/immutable/a.js',
			'/_app/immutable/b.css',
			'/offline.html',
			'/icons/icon-192.png'
		]);
	});
});

describe('offlineRouteFor', () => {
	it('matches offline routes, ignoring a trailing slash', () => {
		expect(offlineRouteFor('/accounts/new')).toBe('/accounts/new');
		expect(offlineRouteFor('/accounts/new/')).toBe('/accounts/new');
		expect(offlineRouteFor('/orders/new')).toBe('/orders/new');
	});

	it('leaves every other page to the offline fallback', () => {
		expect(offlineRouteFor('/accounts')).toBeNull();
		expect(offlineRouteFor('/accounts/new/extra')).toBeNull();
		expect(offlineRouteFor('/')).toBeNull();
	});
});

describe('isCacheablePage', () => {
	it('keeps a real HTML page', () => {
		expect(isCacheablePage(page())).toBe(true);
	});

	it.each([
		['a redirect (signed out)', { redirected: true }],
		['an error', { ok: false }],
		['an opaque response', { type: 'opaque' }],
		['non-HTML', { headers: new Headers({ 'content-type': 'application/json' }) }]
	])('refuses %s', (_label, over) => {
		expect(isCacheablePage(page(over))).toBe(false);
	});
});

describe('keepOnSignOut', () => {
	it('drops every rendered page', () => {
		expect(keepOnSignOut('pages-123', '/accounts/new')).toBe(false);
		expect(keepOnSignOut('pages-123', '/offline.html')).toBe(false);
	});

	it('keeps code and static assets so the app still opens offline next time', () => {
		expect(keepOnSignOut('cache-123', '/_app/immutable/chunks/a.js')).toBe(true);
		expect(keepOnSignOut('cache-123', '/offline.html')).toBe(true);
		expect(keepOnSignOut('cache-123', '/icons/icon-192.png')).toBe(true);
		expect(keepOnSignOut('cache-123', '/manifest.webmanifest')).toBe(true);
	});

	it('drops anything else, such as a page an older worker cached', () => {
		expect(keepOnSignOut('cache-123', '/dashboard')).toBe(false);
		expect(keepOnSignOut('cache-123', '/accounts/123')).toBe(false);
	});
});

describe('offline.html', () => {
	it('lists exactly the offline routes', () => {
		const html = readFileSync(resolve('static/offline.html'), 'utf8');
		const listed = [...html.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]);
		expect(listed).toEqual([...OFFLINE_ROUTES]);
	});
});
