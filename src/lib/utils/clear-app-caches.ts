/**
 * Empties Cache Storage on sign-out, keeping only the offline fallback page.
 *
 * Cache Storage is shared per origin, so the page can clear what the service
 * worker wrote without messaging it. `/offline.html` survives because it holds
 * no user data and the service worker only adds it at install time; deleting
 * it would leave a signed-out visitor with no offline fallback until the next
 * deploy.
 *
 * SCO-206 will also clear the offline outbox and reference snapshot in
 * IndexedDB here, so every sign-out path wipes both stores through one call.
 */
export const KEEP_ON_SIGN_OUT = '/offline.html';

export async function clearAppCaches(
	cacheStorage: CacheStorage | undefined = typeof caches === 'undefined' ? undefined : caches
): Promise<void> {
	if (!cacheStorage) return;
	try {
		for (const name of await cacheStorage.keys()) {
			const cache = await cacheStorage.open(name);
			for (const request of await cache.keys()) {
				if (new URL(request.url).pathname !== KEEP_ON_SIGN_OUT) await cache.delete(request);
			}
		}
	} catch (err) {
		// Never block sign-out on cache cleanup.
		console.error('Clearing app caches failed:', err);
	}
}
