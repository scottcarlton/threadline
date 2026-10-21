import { clearOfflineData } from '$lib/offline';

/**
 * Empties Cache Storage on sign-out, keeping only the offline fallback page.
 *
 * Cache Storage is shared per origin, so the page can clear what the service
 * worker wrote without messaging it. `/offline.html` survives because it holds
 * no user data and the service worker only adds it at install time; deleting
 * it would leave a signed-out visitor with no offline fallback until the next
 * deploy.
 *
 * It also deletes the offline database (outbox now, reference snapshot from
 * SCO-208), so every sign-out path wipes both stores through one call. The
 * sign-out handlers warn first when the outbox still holds unsent work.
 */
export const KEEP_ON_SIGN_OUT = '/offline.html';

export async function clearAppCaches(
	cacheStorage: CacheStorage | undefined = typeof caches === 'undefined' ? undefined : caches,
	clearOffline: () => Promise<void> = clearOfflineData
): Promise<void> {
	try {
		await clearOffline();
	} catch (err) {
		console.error('Clearing offline data failed:', err);
	}
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
