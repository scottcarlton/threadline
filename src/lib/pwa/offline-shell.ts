/**
 * Offline app shell (SCO-209). Shared by the service worker and the app so the
 * rules live in one tested place.
 *
 * Two caches per service-worker version:
 *  - `cache-<version>`: the build's JS/CSS chunks and small static files,
 *    precached at install. No user data; survives sign-out.
 *  - `pages-<version>`: a copy of each offline-capable page, rendered for the
 *    signed-in user. Holds that user's layout data, so sign-out deletes it.
 */

/**
 * Pages that work with no connection once open: no server load of their own,
 * saves go through the outbox. Keep `static/offline.html`'s list in step
 * (a test checks it).
 */
export const OFFLINE_ROUTES = ['/accounts/new', '/orders/new'] as const;

export const codeCacheName = (version: string) => `cache-${version}`;
export const pagesCacheName = (version: string) => `pages-${version}`;
export const isPagesCache = (name: string) => name.startsWith('pages-');

/** Static folders that are marketing-only and too heavy to precache. */
const SKIP_PRECACHE = ['/marketing/', '/seed-images/'];

/** Everything to precache at install: the whole build plus light static files. */
export function precacheList(build: readonly string[], files: readonly string[]): string[] {
	return [...build, ...files.filter((f) => !SKIP_PRECACHE.some((p) => f.startsWith(p)))];
}

/** The offline route a navigation maps to, or null. Ignores trailing slash and query. */
export function offlineRouteFor(pathname: string): string | null {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	return (OFFLINE_ROUTES as readonly string[]).includes(path) ? path : null;
}

/**
 * Only a real, same-origin HTML page is worth keeping: not a redirect to
 * /login (signed out), not an error page, not something else entirely.
 */
export function isCacheablePage(res: {
	ok: boolean;
	redirected: boolean;
	type: string;
	headers: { get(name: string): string | null };
}): boolean {
	return (
		res.ok &&
		!res.redirected &&
		res.type === 'basic' &&
		(res.headers.get('content-type') ?? '').includes('text/html')
	);
}

const STATIC_ASSET = /\.(js|mjs|css|svg|png|jpe?g|webp|gif|ico|json|webmanifest|txt|woff2?)$/i;

/**
 * What survives sign-out. Code and static assets carry no user data and are
 * needed to open the app offline next time; rendered pages carry the user's
 * data and always go.
 */
export function keepOnSignOut(cacheName: string, pathname: string): boolean {
	if (isPagesCache(cacheName)) return false;
	if (pathname === '/offline.html') return true;
	if (pathname.startsWith('/_app/')) return true;
	return STATIC_ASSET.test(pathname);
}
