import * as Sentry from '@sentry/sveltekit';
import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SENTRY_DSN } from '$env/static/public';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { OrgType } from '$lib/types/database.js';

Sentry.init({
	dsn: PUBLIC_SENTRY_DSN,
	tracesSampleRate: 0.1
});

const PUBLIC_ROUTES = ['/login', '/signup', '/invite', '/buyer-invite', '/auth/callback', '/upload', '/features', '/intelligence', '/solutions', '/pricing'];

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
			data: { session }
		} = await supabase.auth.getSession();
		if (!session) return { session: null, user: null };

		const {
			data: { user },
			error
		} = await supabase.auth.getUser();
		if (error) return { session: null, user: null };
		return { session, user };
	};

	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;

	// Initialize buyer locals
	event.locals.isBuyer = false;
	event.locals.buyerAccounts = null;
	event.locals.buyerBrandIds = null;
	event.locals.orgType = 'rep';
	event.locals.allMemberships = [];

	const isPublicRoute = PUBLIC_ROUTES.some((r) => event.url.pathname.startsWith(r));

	// Redirect unauthenticated users to login
	if (!session && !isPublicRoute && event.url.pathname !== '/') {
		throw redirect(303, '/login');
	}

	// Redirect authenticated users away from login/signup
	if (session && (event.url.pathname.startsWith('/login') || event.url.pathname.startsWith('/signup'))) {
		throw redirect(303, '/insight');
	}

	// Load user context for authenticated routes
	if (session && user && !isPublicRoute) {
		const [{ data: profile }, { data: allMemberships }] = await Promise.all([
			supabase.from('profiles').select('*').eq('id', user.id).single(),
			supabase.from('organization_members').select('*, organizations(*)').eq('profile_id', user.id)
		]);

		if (allMemberships?.length) {
			event.locals.allMemberships = allMemberships as any;

			// Determine active org from cookie, fallback to first membership
			const activeOrgId = event.cookies.get('active_org_id');
			const membership = activeOrgId
				? allMemberships.find((m: any) => m.organization_id === activeOrgId) ?? allMemberships[0]
				: allMemberships[0];

			// Org member path
			let brandScope: string[] | null = null;
			let scopedBrandNames: string[] | null = null;
			if (['member', 'sales', 'guest'].includes(membership.role)) {
				const { data: brandAccess } = await supabase
					.from('member_brand_access')
					.select('brand_id, brands(name)')
					.eq('member_id', membership.id);
				if (brandAccess?.length) {
					brandScope = brandAccess.map((b: any) => b.brand_id);
					scopedBrandNames = brandAccess.map((b: any) => b.brands?.name).filter(Boolean);
				}
			}

			const org = membership?.organizations;
			event.locals.user = profile;
			event.locals.membership = membership;
			event.locals.organization = org ?? null;
			event.locals.orgType = (org?.org_type as OrgType) ?? 'rep';
			event.locals.brandScope = brandScope;
			event.locals.scopedBrandNames = scopedBrandNames;

			// SSO enforcement: if org requires SSO, verify user authenticated via SSO
			if (org?.sso_enforced && user.email) {
				const emailDomain = user.email.split('@')[1]?.toLowerCase();
				if (emailDomain) {
					const { data: ssoProvider } = await supabaseAdmin
						.from('organization_sso_providers')
						.select('id')
						.eq('organization_id', org.id)
						.eq('domain', emailDomain)
						.limit(1)
						.single();

					if (ssoProvider) {
						const isSsoSession = user.app_metadata?.provider === 'sso' ||
							user.identities?.some((i: any) => i.provider === 'sso');
						if (!isSsoSession) {
							await supabase.auth.signOut();
							throw redirect(303, '/login?error=sso_required');
						}
					}
				}
			}
		} else {
			// Check if user is a buyer
			const { data: buyerAccess } = await supabase
				.from('account_users')
				.select('*, accounts(*, organizations(*))')
				.eq('profile_id', user.id);

			if (buyerAccess?.length) {
				event.locals.user = profile;
				event.locals.isBuyer = true;
				event.locals.buyerAccounts = buyerAccess;

				// Load accessible brand IDs (use admin client to bypass RLS)
				const accountIds = buyerAccess.map((a: any) => a.account_id);
				const { data: brandAccess } = await supabaseAdmin
					.from('account_brand_access')
					.select('brand_id')
					.in('account_id', accountIds);
				event.locals.buyerBrandIds = brandAccess?.map((b: any) => b.brand_id) ?? null;

				// Set organization from the account's org (use admin to bypass RLS)
				const orgId = buyerAccess[0]?.accounts?.organization_id;
				if (orgId) {
					const { data: org } = await supabaseAdmin
						.from('organizations')
						.select('*')
						.eq('id', orgId)
						.single();
					if (org) event.locals.organization = org;
				}
			} else {
				// No org membership and not a buyer — redirect to onboarding
				event.locals.user = profile;
				if (!event.url.pathname.startsWith('/onboarding') && !event.url.pathname.startsWith('/api/')) {
					throw redirect(303, '/onboarding');
				}
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
