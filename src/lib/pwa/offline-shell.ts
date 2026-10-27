/**
 * Offline app shell (SCO-209). Shared by the service worker and the app so the
 * rules live in one tested place.
 *
 * Two caches per service-worker version:
 *  - `cache-<version>`: the build's JS/CSS chunks and small static files,
 *    precached at install. No user data; survives sign-out.
 *  - `pages-<version>`: pages rendered for the signed-in user: the offline
 *    forms and the in-app fallback (asked for by the app), plus every page and
 *    its `__data.json` the user opened while online, so they can still move
 *    around the app offline. Holds that user's data, so sign-out deletes it.
 */

/**
 * Pages that work with no connection once open: no server load of their own,
 * saves go through the outbox. Keep `static/offline.html`'s list in step
 * (a test checks it).
 */
export const OFFLINE_ROUTES = ['/accounts/new', '/orders/new'] as const;

/**
 * The in-app page served for any other navigation while offline, so the user
 * stays inside the app shell instead of landing on `static/offline.html`.
 * That static page is the last resort: signed out, or nothing cached yet.
 * Not `/offline`: the static file server resolves that to `offline.html`.
 */
export const OFFLINE_FALLBACK = '/offline-shell';

/**
 * Pages the worker keeps a copy of for this user. Buyers cannot open the rep
 * forms, so they only get the fallback.
 */
export function offlinePagesFor({ buyer }: { buyer: boolean }): string[] {
	return buyer ? [OFFLINE_FALLBACK] : [...OFFLINE_ROUTES, OFFLINE_FALLBACK];
}

/** Every page the worker may be asked to cache; anything else is refused. */
export const CACHEABLE_PAGES: readonly string[] = offlinePagesFor({ buyer: false });

/** Pages never kept from browsing: signing in and out must always hit the server. */
const NEVER_KEEP = ['/login', '/logout', '/auth/'];

/**
 * The cache key for a page the user opened while online, or null when it is
 * not kept. Trailing slash ignored, query kept: `/orders?status=open` and
 * `/orders` are different pages.
 */
export function visitedPageKey(url: { pathname: string; search: string }): string | null {
	const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
	if (NEVER_KEEP.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`))) {
		return null;
	}
	return path + url.search;
}

/**
 * Cached pages to try, in order, for a navigation that failed offline: the
 * copy saved when the user last opened it, the offline form it maps to, then
 * the in-app fallback.
 */
export function offlineCandidates(url: { pathname: string; search: string }): string[] {
	const keys: string[] = [];
	const visited = visitedPageKey(url);
	if (visited) keys.push(visited);
	const route = offlineRouteFor(url.pathname);
	if (route && !keys.includes(route)) keys.push(route);
	keys.push(OFFLINE_FALLBACK);
	return keys;
}

/** SvelteKit's client-side navigation data request for a page. */
export function isPageDataPath(pathname: string): boolean {
	return pathname.endsWith('/__data.json');
}

/** SvelteKit's query naming which loads a data request reruns. */
const INVALIDATED_PARAM = 'x-sveltekit-invalidated';

/** The data URL for a page with every load run, e.g. `/orders/new/__data.json`. */
export function fullPageDataPath(route: string): string {
	return `${route === '/' ? '' : route}/__data.json`;
}

/**
 * The key of a page's full data, which answers a request for any subset of its
 * loads. Saved when a response has every load (no or all-ones mask), and tried
 * offline after the exact URL misses.
 */
export function fullPageDataKey(url: { pathname: string; search: string }): string {
	const params = new URLSearchParams(url.search);
	params.delete(INVALIDATED_PARAM);
	const query = params.toString();
	return url.pathname + (query ? `?${query}` : '');
}

/** True when a data request runs every load, so its response is the full data. */
export function isFullPageDataRequest(url: { search: string }): boolean {
	const mask = new URLSearchParams(url.search).get(INVALIDATED_PARAM);
	return mask === null || /^1+$/.test(mask);
}

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
export function isCacheablePage(res: CacheableResponse): boolean {
	return isCacheable(res, 'text/html');
}

/** The same rule for a page's `__data.json`. */
export function isCacheablePageData(res: CacheableResponse): boolean {
	return isCacheable(res, 'application/json');
}

type CacheableResponse = {
	ok: boolean;
	redirected: boolean;
	type: string;
	headers: { get(name: string): string | null };
};

function isCacheable(res: CacheableResponse, contentType: string): boolean {
	return (
		res.ok &&
		!res.redirected &&
		res.type === 'basic' &&
		(res.headers.get('content-type') ?? '').includes(contentType)
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

/**
 * Product images (SCO-208). The app always points at the stable same-origin
 * URL, which redirects to a storage URL signed for five minutes, so the cache
 * keys on the stable URL (with its `?size=`). Not per deploy: images do not
 * change with the build. Scoped to what the user may see, so sign-out deletes it.
 */
export const IMAGES_CACHE = 'product-images';

const PRODUCT_IMAGE = /^\/api\/products\/[^/]+\/images\/[^/]+$/;

export function isProductImagePath(pathname: string): boolean {
	return PRODUCT_IMAGE.test(pathname);
}

/** Caches holding user-scoped data; sign-out deletes each one whole. */
export function isUserCache(name: string): boolean {
	return isPagesCache(name) || name === IMAGES_CACHE;
}

/** Sizes the order wizard renders: `thumb` in cart rows and sheets, `card` in the picker grid. */
export const WARM_SIZES = ['thumb', 'card'] as const;
/** Cap per refresh so a big catalog never turns into an unbounded download. */
export const WARM_LIMIT = 400;

/**
 * Image URLs to fetch ahead so the catalog has pictures offline: each
 * product's primary image (else its first) at each size the wizard renders.
 */
export function warmImageUrls(
	products: Array<{
		id: string;
		product_images?: Array<{ id: string; is_primary: boolean }> | null;
	}>,
	limit = WARM_LIMIT
): string[] {
	const urls: string[] = [];
	for (const p of products) {
		const images = p.product_images ?? [];
		const image = images.find((i) => i.is_primary) ?? images[0];
		if (!image) continue;
		for (const size of WARM_SIZES)
			urls.push(`/api/products/${p.id}/images/${image.id}?size=${size}`);
		if (urls.length >= limit) break;
	}
	return urls.slice(0, limit);
}
