import type { Cookies } from '@sveltejs/kit';

// Where to send the user after a mailbox OAuth round-trip.
//
// Carried in a short-lived httpOnly cookie rather than the OAuth `state`
// parameter: Gmail's callback verifies `state === user.id` exactly, so packing
// anything else in there would break that check.

const COOKIE = 'oauth_return_to';
const MAX_AGE_SECONDS = 600;

/**
 * Only same-origin relative paths are accepted. A value like
 * `//evil.example.com` is protocol-relative and would leave the site, so a
 * second leading slash is rejected along with anything not starting with `/`.
 */
export function isSafeReturnPath(path: string | null | undefined): path is string {
	if (!path) return false;
	if (!path.startsWith('/')) return false;
	if (path.startsWith('//')) return false;
	if (path.includes('\\')) return false;
	return path.length <= 512;
}

export function rememberReturnPath(cookies: Cookies, path: string | null, secure: boolean): void {
	if (!isSafeReturnPath(path)) return;
	cookies.set(COOKIE, path, {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge: MAX_AGE_SECONDS
	});
}

/**
 * Read and clear the stored path, appending the caller's success marker.
 * Falls back to the settings page, which is where these flows landed before
 * they could be started from anywhere else.
 */
export function takeReturnPath(
	cookies: Cookies,
	successParam: string,
	fallback = '/settings'
): string {
	const stored = cookies.get(COOKIE);
	cookies.delete(COOKIE, { path: '/' });
	const base = isSafeReturnPath(stored) ? stored : fallback;
	const separator = base.includes('?') ? '&' : '?';
	return `${base}${separator}${successParam}`;
}
