import * as Sentry from '@sentry/sveltekit';
import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY,
	PUBLIC_SENTRY_DSN
} from '$env/static/public';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { isSystemAdminEmail } from '$lib/server/system-admin.js';
import { isEmailWhitelisted } from '$lib/server/beta-whitelist.js';
import { loadUserContext, applyUserContext } from '$lib/server/auth.js';
import { landingPathForOrgType } from '$lib/server/landing.js';
import type { OrgType } from '$lib/types/database.js';

Sentry.init({
	dsn: PUBLIC_SENTRY_DSN,
	enabled: !dev,
	environment: import.meta.env.VERCEL_ENV ?? (dev ? 'development' : 'production'),
	tracesSampleRate: 0.1,
	beforeSend(event, hint) {
		const err = hint?.originalException as
			| { status?: number; location?: string; body?: { message?: string } }
			| undefined;

		// SvelteKit `error(404, …)` / `redirect(303, …)` aren't bugs — don't page on them.
		if (err && typeof err === 'object') {
			if (typeof err.status === 'number' && err.status >= 300 && err.status < 500) return null;
			if (typeof err.location === 'string') return null;
		}

		return event;
	}
});

const PUBLIC_ROUTES = [
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
	'/beta',
	'/legal'
];

const authHandle: Handle = async ({ event, resolve }) => {
	const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		},
		auth: {
			detectSessionInUrl: false
		}
	});

	event.locals.supabase = supabase;

	event.locals.safeGetSession = async () => {
		const {
			data: { user },
			error
		} = await supabase.auth.getUser();
		if (error || !user) return { session: null, user: null };

		const {
			data: { session }
		} = await supabase.auth.getSession();
		if (!session) return { session: null, user: null };
		return { session, user };
	};

	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;

	// Initialize buyer locals
	event.locals.isBuyer = false;
	event.locals.buyerAccounts = null;
	event.locals.buyerBrandIds = null;
	event.locals.organization = null;
	event.locals.isSystemAdmin = false;
	event.locals.orgType = 'rep';
	event.locals.allMemberships = [];

	const isPublicRoute = PUBLIC_ROUTES.some((r) => event.url.pathname.startsWith(r));

	// Beta whitelist gate: reject users not on the whitelist
	if (session && user && !isPublicRoute) {
		const whitelisted = await isEmailWhitelisted(user.email ?? '');
		if (!whitelisted) {
			await supabase.auth.signOut();
			throw redirect(303, '/login?error=beta_not_whitelisted');
		}
	}

	// Redirect unauthenticated users to login
	if (!session && !isPublicRoute && event.url.pathname !== '/') {
		throw redirect(303, '/login');
	}

	// Redirect authenticated users away from login
	if (session && event.url.pathname.startsWith('/login')) {
		if (isSystemAdminEmail(user?.email)) {
			throw redirect(303, '/system');
		}
		// Retailer-org members belong in the buyer portal (/dashboard); rep/brand
		// members go to /insight. Resolve the active membership's org_type to fork.
		const { data: loginMemberships } = await supabase
			.from('organization_members')
			.select('organization_id, organizations(org_type)')
			.eq('profile_id', user?.id ?? '');
		const activeOrgId = event.cookies.get('active_org_id');
		const rows = (loginMemberships ?? []) as Array<{
			organization_id: string;
			organizations: { org_type?: string } | { org_type?: string }[] | null;
		}>;
		const active = activeOrgId
			? (rows.find((m) => m.organization_id === activeOrgId) ?? rows[0])
			: rows[0];
		const activeOrg = active?.organizations;
		const activeType = Array.isArray(activeOrg) ? activeOrg[0]?.org_type : activeOrg?.org_type;
		throw redirect(303, landingPathForOrgType((activeType as OrgType) ?? 'rep'));
	}

	// Load user context for authenticated routes
	if (session && user && !isPublicRoute) {
		const context = await loadUserContext(
			supabase,
			supabaseAdmin,
			user,
			event.cookies.get('active_org_id')
		);
		applyUserContext(event.locals, context);

		switch (context.kind) {
			case 'system_admin': {
				// Confine the system super-admin session to /system/** and its
				// API/logout escape hatches.
				const path = event.url.pathname;
				const allowed =
					path.startsWith('/system') || path.startsWith('/api/') || path.startsWith('/logout');
				if (!allowed) throw redirect(303, '/system');
				return resolve(event);
			}
			case 'org_member': {
				// SSO enforcement: org requires SSO but session isn't an SSO session.
				if (context.ssoRequired) {
					await supabase.auth.signOut();
					throw redirect(303, '/login?error=sso_required');
				}
				break;
			}
			case 'onboarding': {
				// No org membership and not a buyer — redirect to onboarding.
				if (
					!event.url.pathname.startsWith('/onboarding') &&
					!event.url.pathname.startsWith('/api/')
				) {
					throw redirect(303, '/onboarding');
				}
				break;
			}
		}
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

export const handle = sequence(Sentry.sentryHandle(), authHandle);
export const handleError = Sentry.handleErrorWithSentry();
