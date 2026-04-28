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

const PRECACHE_URLS = [
	...build, // SvelteKit-built JS/CSS chunks
	...files, // anything in /static
	'/offline.html'
];

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
			await Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k)));
			await self.clients.claim();
			// Notify clients that an update is available (only if a previous SW was controlling).
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
