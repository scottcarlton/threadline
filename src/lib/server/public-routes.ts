// Paths the auth hook lets through without a session.
//
// Cron and webhook endpoints are called by machines (Vercel Cron, Twilio,
// Brevo) that never have a session. Each one checks its own credential: a
// CRON_SECRET bearer token or the provider's signature. Without these entries
// the hook redirects them to /login before that check runs, and the provider
// sees a 303 instead of reaching the endpoint.
export const PUBLIC_ROUTES = [
	'/login',
	'/invite',
	'/buyer-invite',
	'/connect',
	'/auth/callback',
	'/logout',
	'/upload',
	'/api/dev',
	'/api/beta',
	'/api/auth/check-whitelist',
	'/api/cron/',
	'/api/webhooks/',
	'/beta',
	'/legal'
];

export function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
}
