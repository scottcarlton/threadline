/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(['/offline.html']);
			self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
			await self.clients.claim();
		})()
	);
});

function shouldSkipCache(request: Request): boolean {
	const url = new URL(request.url);
	if (request.method !== 'GET') return true;
	if (url.pathname.startsWith('/api/')) return true;
	if (url.pathname.startsWith('/auth/')) return true;
	if (url.pathname.endsWith('/__data.json')) return true;
	if (url.hostname.endsWith('.supabase.co')) return true;
	if (url.hostname === '127.0.0.1' && url.port === '54322') return true;
	if (url.hostname.includes('sentry.io') || url.hostname.includes('ingest.sentry')) return true;
	return false;
}

async function networkFirstPage(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const networkRes = await fetch(request);
		if (networkRes.ok) cache.put(request, networkRes.clone());
		return networkRes;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		const offline = await caches.match('/offline.html');
		return offline ?? new Response('Offline', { status: 503 });
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
	if (shouldSkipCache(request)) return;

	const url = new URL(request.url);
	const isSameOrigin = url.origin === self.location.origin;
	if (!isSameOrigin) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirstPage(request));
		return;
	}

	if (url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(cacheFirst(request));
		return;
	}
});
