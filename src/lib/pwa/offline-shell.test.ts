import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	CACHEABLE_PAGES,
	IMAGES_CACHE,
	OFFLINE_FALLBACK,
	OFFLINE_ROUTES,
	fullPageDataKey,
	fullPageDataPath,
	isCacheablePageData,
	isFullPageDataRequest,
	isPageDataPath,
	offlineCandidates,
	offlinePagesFor,
	visitedPageKey,
	isProductImagePath,
	isUserCache,
	warmImageUrls,
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

const at = (href: string) => new URL(href, 'https://app.test');

describe('offlinePagesFor', () => {
	it('gives reps the offline forms and the fallback', () => {
		expect(offlinePagesFor({ buyer: false })).toEqual([...OFFLINE_ROUTES, OFFLINE_FALLBACK]);
	});

	it('gives buyers only the fallback, since they cannot open the rep forms', () => {
		expect(offlinePagesFor({ buyer: true })).toEqual([OFFLINE_FALLBACK]);
	});

	it('lets the worker cache every page either role asks for', () => {
		expect([...CACHEABLE_PAGES].sort()).toEqual([...OFFLINE_ROUTES, OFFLINE_FALLBACK].sort());
	});
});

describe('visitedPageKey', () => {
	it('keys a page by path and query, ignoring a trailing slash', () => {
		expect(visitedPageKey(at('/orders'))).toBe('/orders');
		expect(visitedPageKey(at('/orders/'))).toBe('/orders');
		expect(visitedPageKey(at('/orders?status=open'))).toBe('/orders?status=open');
		expect(visitedPageKey(at('/'))).toBe('/');
	});

	it('keeps a page data request under its own key', () => {
		expect(visitedPageKey(at('/orders/__data.json?x-sveltekit-invalidated=01'))).toBe(
			'/orders/__data.json?x-sveltekit-invalidated=01'
		);
	});

	it.each(['/login', '/login/', '/login?next=/orders', '/logout', '/auth/callback'])(
		'never keeps %s',
		(href) => {
			expect(visitedPageKey(at(href))).toBeNull();
		}
	);

	it('does not mistake a lookalike path for sign-in', () => {
		expect(visitedPageKey(at('/logins-report'))).toBe('/logins-report');
	});
});

describe('offlineCandidates', () => {
	it('tries the saved copy, then the in-app fallback', () => {
		expect(offlineCandidates(at('/orders'))).toEqual(['/orders', OFFLINE_FALLBACK]);
	});

	it('falls back to the offline form for its own URL', () => {
		expect(offlineCandidates(at('/orders/new/'))).toEqual(['/orders/new', OFFLINE_FALLBACK]);
		expect(offlineCandidates(at('/accounts/new?from=x'))).toEqual([
			'/accounts/new?from=x',
			'/accounts/new',
			OFFLINE_FALLBACK
		]);
	});

	it('never serves a saved sign-in page', () => {
		expect(offlineCandidates(at('/login'))).toEqual([OFFLINE_FALLBACK]);
	});
});

describe('isPageDataPath', () => {
	it('matches SvelteKit data requests only', () => {
		expect(isPageDataPath('/orders/__data.json')).toBe(true);
		expect(isPageDataPath('/__data.json')).toBe(true);
		expect(isPageDataPath('/orders')).toBe(false);
		expect(isPageDataPath('/api/orders.json')).toBe(false);
	});
});

describe('full page data', () => {
	it('builds the data URL that runs every load', () => {
		expect(fullPageDataPath('/orders/new')).toBe('/orders/new/__data.json');
		expect(fullPageDataPath('/')).toBe('/__data.json');
	});

	it('keys full data without the invalidation mask, keeping other params', () => {
		expect(fullPageDataKey(at('/orders/__data.json?x-sveltekit-invalidated=01'))).toBe(
			'/orders/__data.json'
		);
		expect(fullPageDataKey(at('/orders/__data.json?status=open&x-sveltekit-invalidated=11'))).toBe(
			'/orders/__data.json?status=open'
		);
	});

	it('treats a missing or all-ones mask as every load', () => {
		expect(isFullPageDataRequest(at('/orders/__data.json'))).toBe(true);
		expect(isFullPageDataRequest(at('/orders/__data.json?x-sveltekit-invalidated=111'))).toBe(true);
		expect(isFullPageDataRequest(at('/orders/__data.json?x-sveltekit-invalidated=01'))).toBe(false);
	});

	it('never collides with the static offline page', () => {
		expect(OFFLINE_FALLBACK).not.toBe('/offline');
	});
});

describe('isCacheablePageData', () => {
	const data = (over: Partial<Parameters<typeof isCacheablePageData>[0]> = {}) => ({
		...page(),
		headers: new Headers({ 'content-type': 'application/json' }),
		...over
	});

	it('keeps real page data', () => {
		expect(isCacheablePageData(data())).toBe(true);
	});

	it.each([
		['an error', { ok: false }],
		['a redirect', { redirected: true }],
		['HTML', { headers: new Headers({ 'content-type': 'text/html' }) }]
	])('refuses %s', (_label, over) => {
		expect(isCacheablePageData(data(over))).toBe(false);
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

describe('product images', () => {
	it('recognises the stable image URL and nothing else under /api', () => {
		expect(isProductImagePath('/api/products/p1/images/i1')).toBe(true);
		expect(isProductImagePath('/api/products/p1/images')).toBe(false);
		expect(isProductImagePath('/api/products')).toBe(false);
		expect(isProductImagePath('/api/products/p1/images/i1/extra')).toBe(false);
	});

	it('treats pages and images as user data', () => {
		expect(isUserCache('pages-1')).toBe(true);
		expect(isUserCache(IMAGES_CACHE)).toBe(true);
		expect(isUserCache('cache-1')).toBe(false);
	});

	it('warms each primary image at every size the wizard renders, capped', () => {
		const products = [
			{
				id: 'p1',
				product_images: [
					{ id: 'a', is_primary: false },
					{ id: 'b', is_primary: true }
				]
			},
			{ id: 'p2', product_images: [{ id: 'c', is_primary: false }] },
			{ id: 'p3', product_images: [] }
		];
		expect(warmImageUrls(products)).toEqual([
			'/api/products/p1/images/b?size=thumb',
			'/api/products/p1/images/b?size=card',
			'/api/products/p2/images/c?size=thumb',
			'/api/products/p2/images/c?size=card'
		]);
		expect(warmImageUrls(products, 3)).toHaveLength(3);
	});
});
