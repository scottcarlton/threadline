/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const PRECACHE = `precache-${version}`;
const PAGES = `pages-${version}`;
const STATIC = `static-${version}`;
const ALL_CACHES = [PRECACHE, PAGES, STATIC];

// Dedupe — `/offline.html` lives in /static, so it's already in `files`.
// Listing it again would make cache.addAll throw on duplicate requests,
// which fails the SW install and leaves the previous SW serving stale
// content (so source edits never reach the page).
const PRECACHE_URLS = Array.from(new Set([...build, ...files, '/offline.html']));

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(PRECACHE);
			await cache.addAll(PRECACHE_URLS);
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			// A prior precache from a different version means this is a real update
			// (not a first-install). Without this guard the toast fires on first
			// install too, and re-fires for every client that loads the page after
			// the SW activates — including immediately after the user reloads.
			const hadPriorPrecache = keys.some((k) => k.startsWith('precache-') && k !== PRECACHE);
			await Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k)));
			await self.clients.claim();
			if (!hadPriorPrecache) return;
			const clients = await self.clients.matchAll({ type: 'window' });
			for (const client of clients) {
				client.postMessage({ type: 'updateAvailable' });
			}
		})()
	);
});

function shouldSkipCache(request: Request): boolean {
	const url = new URL(request.url);
	if (request.method !== 'GET') return true;
	if (url.pathname.startsWith('/api/')) return true;
	if (url.pathname.startsWith('/auth/')) return true;
	// SvelteKit fetches `__data.json` on every client-side navigation to get
	// the destination's load data. If we serve those from cache (even
	// stale-while-revalidate), the user sees the previous render's data on
	// the next visit — newly created accounts/orders/products don't appear
	// until a hard reload. Always go to network for load data.
	if (url.pathname.endsWith('/__data.json')) return true;
	if (url.hostname.endsWith('.supabase.co')) return true;
	if (url.hostname === '127.0.0.1' && url.port === '54322') return true; // local Supabase
	if (url.hostname.includes('sentry.io') || url.hostname.includes('ingest.sentry')) return true;
	return false;
}

async function trimCache(cacheName: string, maxEntries: number): Promise<void> {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	if (keys.length <= maxEntries) return;
	const overflow = keys.length - maxEntries;
	for (let i = 0; i < overflow; i++) {
		await cache.delete(keys[i]);
	}
}

async function networkFirstPage(request: Request): Promise<Response> {
	const cache = await caches.open(PAGES);
	try {
		const networkRes = await fetch(request);
		if (networkRes.ok) {
			cache.put(request, networkRes.clone());
			trimCache(PAGES, 30);
		}
		return networkRes;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		const offline = await caches.match('/offline.html');
		return offline ?? new Response('Offline', { status: 503 });
	}
}

async function staleWhileRevalidate(request: Request): Promise<Response> {
	const cache = await caches.open(STATIC);
	const cached = await cache.match(request);
	const networkPromise = fetch(request)
		.then((res) => {
			if (res.ok) {
				cache.put(request, res.clone());
				trimCache(STATIC, 60);
			}
			return res;
		})
		.catch(() => cached);
	return cached ?? (await networkPromise) ?? new Response('Offline', { status: 503 });
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (shouldSkipCache(request)) return; // pass through to network

	const url = new URL(request.url);
	const isNavigation = request.mode === 'navigate';
	const isSameOrigin = url.origin === self.location.origin;

	if (isNavigation) {
		event.respondWith(networkFirstPage(request));
		return;
	}

	if (isSameOrigin) {
		event.respondWith(staleWhileRevalidate(request));
		return;
	}
	// cross-origin GETs (fonts, etc.): pass through
});
