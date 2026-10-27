/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import {
	CACHEABLE_PAGES,
	IMAGES_CACHE,
	codeCacheName,
	isCacheablePage,
	fullPageDataKey,
	fullPageDataPath,
	isCacheablePageData,
	isFullPageDataRequest,
	isPageDataPath,
	isProductImagePath,
	offlineCandidates,
	visitedPageKey,
	pagesCacheName,
	precacheList
} from '$lib/pwa/offline-shell';

declare const self: ServiceWorkerGlobalScope;

const CACHE = codeCacheName(version);
const PAGES = pagesCacheName(version);
const PRECACHE = precacheList(build, files);
const PRECACHED = new Set(PRECACHE);

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			// The whole build, so every route's code is here offline even if it
			// was never visited (SCO-209).
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
			self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Old versions go, pages included: a page rendered by an older build
			// points at chunks this version no longer has. The app asks for fresh
			// copies once this worker takes over.
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((k) => k !== CACHE && k !== PAGES && k !== IMAGES_CACHE)
					.map((k) => caches.delete(k))
			);
			await self.clients.claim();
		})()
	);
});

/**
 * Keep a copy of each page the app asks for (offlinePagesFor), as the
 * signed-in user sees it. The app sends this message while online and signed
 * in; a fetch that lands on /login (signed out) or fails is skipped, never
 * stored. Routes outside CACHEABLE_PAGES are ignored.
 */
async function cacheOfflinePages(routes: string[]): Promise<void> {
	const cache = await caches.open(PAGES);
	await Promise.all(
		routes
			.filter((route) => CACHEABLE_PAGES.includes(route))
			.map(async (route) => {
				try {
					const res = await fetch(route, { credentials: 'same-origin', cache: 'no-store' });
					if (isCacheablePage(res)) await cache.put(route, res);
					// A page with `ssr = false` loads its data on a full load too, so
					// keep its full data alongside.
					const dataPath = fullPageDataPath(route);
					const data = await fetch(dataPath, { credentials: 'same-origin', cache: 'no-store' });
					if (isCacheablePageData(data)) await cache.put(dataPath, data);
				} catch {
					// Offline or the server is down: keep whatever copy we had.
				}
			})
	);
}

/**
 * Product images, cache-first under their stable URL (SCO-208). On a miss the
 * image is fetched with CORS (storage allows it), so the cached copy is a
 * normal response rather than an opaque one, which Chrome pads heavily against
 * the storage quota. If CORS is refused, the image still loads, uncached.
 */
async function productImage(request: Request): Promise<Response> {
	const cache = await caches.open(IMAGES_CACHE);
	const hit = await cache.match(request.url);
	if (hit) return hit;
	try {
		const res = await fetch(new Request(request.url, { mode: 'cors', credentials: 'same-origin' }));
		if (res.ok) await cache.put(request.url, res.clone());
		return res;
	} catch {
		try {
			return await fetch(request);
		} catch {
			return new Response(null, { status: 504 });
		}
	}
}

/** Fetch ahead, a few at a time, skipping what is already cached. */
async function warmProductImages(urls: string[]): Promise<void> {
	const queue = urls.filter((u) => isProductImagePath(new URL(u, self.location.origin).pathname));
	const worker = async () => {
		for (let url = queue.shift(); url; url = queue.shift()) {
			await productImage(new Request(new URL(url, self.location.origin).href));
		}
	};
	await Promise.all([worker(), worker(), worker()]);
}

self.addEventListener('message', (event) => {
	const data = event.data as { type?: string; urls?: string[]; routes?: string[] } | null;
	if (data?.type === 'cache-offline-pages' && Array.isArray(data.routes)) {
		event.waitUntil(cacheOfflinePages(data.routes));
	}
	if (data?.type === 'warm-product-images' && Array.isArray(data.urls)) {
		event.waitUntil(warmProductImages(data.urls));
	}
});

function shouldSkipCache(request: Request): boolean {
	const url = new URL(request.url);
	if (request.method !== 'GET') return true;
	if (url.pathname.startsWith('/api/')) return true;
	if (url.pathname.startsWith('/auth/')) return true;
	if (url.hostname.endsWith('.supabase.co')) return true;
	if (url.hostname === '127.0.0.1' && url.port === '54322') return true;
	if (url.hostname.includes('sentry.io') || url.hostname.includes('ingest.sentry')) return true;
	return false;
}

// Navigations always go to the network first, so online the user never sees a
// stale page; each page that loads is kept so it still opens offline. Offline,
// the kept copy is served, else the offline form the URL maps to, else the
// in-app fallback page, all inside the app shell where the offline banner
// shows. The static offline.html is only for when nothing is cached (signed
// out, first visit).
async function networkFirstPage(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const key = visitedPageKey(url);
	try {
		const res = await fetch(request);
		if (key && isCacheablePage(res)) {
			const copy = res.clone();
			void caches.open(PAGES).then((c) => c.put(key, copy));
		}
		return res;
	} catch {
		const cache = await caches.open(PAGES);
		for (const route of offlineCandidates(url)) {
			const page = await cache.match(route);
			if (page) return page;
		}
		const offline = await caches.match('/offline.html');
		return offline ?? new Response('Offline', { status: 503 });
	}
}

// A page's data, same rule as the page itself. The key is the full URL:
// SvelteKit's query says which loads to rerun, and the response only holds
// those. A response with every load is also kept under the URL without that
// query, since it answers any request for the page. With no copy the request
// fails, and SvelteKit falls back to a full navigation, which networkFirstPage
// answers.
async function networkFirstPageData(request: Request): Promise<Response> {
	const cache = await caches.open(PAGES);
	const url = new URL(request.url);
	const fullKey = fullPageDataKey(url);
	try {
		const res = await fetch(request);
		if (isCacheablePageData(res)) {
			void cache.put(request.url, res.clone());
			if (isFullPageDataRequest(url)) void cache.put(fullKey, res.clone());
		}
		return res;
	} catch (err) {
		const hit = (await cache.match(request.url)) ?? (await cache.match(fullKey));
		if (hit) return hit;
		throw err;
	}
}

// Dev only: Vite serves each module on request rather than as a precached
// build, so keep what has loaded to let the app run offline on localhost.
async function networkFirstAsset(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const res = await fetch(request);
		if (res.ok && res.type === 'basic') void cache.put(request, res.clone());
		return res;
	} catch (err) {
		const hit = await cache.match(request);
		if (hit) return hit;
		throw err;
	}
}

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	const networkRes = await fetch(request);
	if (networkRes.ok) cache.put(request, networkRes.clone());
	return networkRes;
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	// Checked before the /api skip: the one /api route that is safe and useful
	// to cache.
	const reqUrl = new URL(request.url);
	if (
		request.method === 'GET' &&
		reqUrl.origin === self.location.origin &&
		isProductImagePath(reqUrl.pathname)
	) {
		event.respondWith(productImage(request));
		return;
	}
	if (shouldSkipCache(request)) return;

	const url = new URL(request.url);
	const isSameOrigin = url.origin === self.location.origin;
	if (!isSameOrigin) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirstPage(request));
		return;
	}

	if (isPageDataPath(url.pathname)) {
		if (visitedPageKey(url)) event.respondWith(networkFirstPageData(request));
		return;
	}

	if (url.pathname.startsWith('/_app/immutable/') || PRECACHED.has(url.pathname)) {
		event.respondWith(cacheFirst(request));
		return;
	}

	if (import.meta.env.DEV) {
		event.respondWith(networkFirstAsset(request));
	}
});
