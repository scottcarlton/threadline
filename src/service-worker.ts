/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import {
	OFFLINE_ROUTES,
	codeCacheName,
	isCacheablePage,
	offlineRouteFor,
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
				keys.filter((k) => k !== CACHE && k !== PAGES).map((k) => caches.delete(k))
			);
			await self.clients.claim();
		})()
	);
});

/**
 * Keep a copy of each offline-capable page as the signed-in user sees it. The
 * app sends this message while online and signed in; a fetch that lands on
 * /login (signed out) or fails is skipped, never stored.
 */
async function cacheOfflinePages(): Promise<void> {
	const cache = await caches.open(PAGES);
	await Promise.all(
		OFFLINE_ROUTES.map(async (route) => {
			try {
				const res = await fetch(route, { credentials: 'same-origin', cache: 'no-store' });
				if (isCacheablePage(res)) await cache.put(route, res);
			} catch {
				// Offline or the server is down: keep whatever copy we had.
			}
		})
	);
}

self.addEventListener('message', (event) => {
	if ((event.data as { type?: string } | null)?.type === 'cache-offline-pages') {
		event.waitUntil(cacheOfflinePages());
	}
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

// Navigations always go to the network: a fresh page is never written to the
// cache here. Offline, an offline-capable page is served from the copy the app
// asked for (cacheOfflinePages); everything else gets the static fallback.
async function networkFirstPage(request: Request): Promise<Response> {
	try {
		return await fetch(request);
	} catch {
		const route = offlineRouteFor(new URL(request.url).pathname);
		if (route) {
			const page = await caches.open(PAGES).then((c) => c.match(route));
			if (page) return page;
		}
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

	if (url.pathname.startsWith('/_app/immutable/') || PRECACHED.has(url.pathname)) {
		event.respondWith(cacheFirst(request));
		return;
	}
});
