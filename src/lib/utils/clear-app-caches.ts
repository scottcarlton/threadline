import { clearOfflineData } from '$lib/offline';
import { isUserCache, keepOnSignOut } from '$lib/pwa/offline-shell';

/**
 * Empties the user's data from Cache Storage on sign-out.
 *
 * Cache Storage is shared per origin, so the page can clear what the service
 * worker wrote without messaging it. Rendered pages (the offline copies of
 * offline-capable routes, SCO-209) and product images (SCO-208) are scoped to
 * the user and always go. The
 * precached code, static assets and `/offline.html` hold none, and the service
 * worker only adds them at install time; deleting them would leave the next
 * sign-in unable to open the app offline until the next deploy.
 *
 * It also deletes the offline database (outbox now, reference snapshot from
 * SCO-208), so every sign-out path wipes both stores through one call. The
 * sign-out handlers warn first when the outbox still holds unsent work.
 */
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
			if (isUserCache(name)) {
				await cacheStorage.delete(name);
				continue;
			}
			const cache = await cacheStorage.open(name);
			for (const request of await cache.keys()) {
				if (!keepOnSignOut(name, new URL(request.url).pathname)) await cache.delete(request);
			}
		}
	} catch (err) {
		// Never block sign-out on cache cleanup.
		console.error('Clearing app caches failed:', err);
	}
}
