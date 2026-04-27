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

self.addEventListener('fetch', (event) => {
	// Phase-1 skeleton: pass through to network, no caching yet.
	event.respondWith(fetch(event.request));
});
