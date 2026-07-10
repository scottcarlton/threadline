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
import { resolveBuyerContext } from '$lib/server/buyer-context.js';
import { landingPathForOrgType } from '$lib/server/landing.js';
import type { OrgType, OrganizationMember, Organization } from '$lib/types/database.js';

type MembershipWithOrg = OrganizationMember & { organizations: Organization };
type BrandAccessRow = { brand_id: string; brands?: { name?: string } | { name?: string }[] | null };
type SsoIdentity = { provider?: string };

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
		// System super-admin path: above-org identity, no org/buyer context.
		// Confines the session to /system/** and its API/logout escape hatches.
		if (isSystemAdminEmail(user.email)) {
			const { data: profile } = await supabaseAdmin
				.from('profiles')
				.select('*')
				.eq('id', user.id)
				.single();
			event.locals.user = profile;
			event.locals.isSystemAdmin = true;
			const path = event.url.pathname;
			const allowed =
				path.startsWith('/system') || path.startsWith('/api/') || path.startsWith('/logout');
			if (!allowed) throw redirect(303, '/system');
			return resolve(event);
		}

		const [{ data: profile }, { data: allMemberships }] = await Promise.all([
			supabaseAdmin.from('profiles').select('*').eq('id', user.id).single(),
			supabase.from('organization_members').select('*, organizations(*)').eq('profile_id', user.id)
		]);

		if (allMemberships?.length) {
			const typedMemberships = allMemberships as MembershipWithOrg[];
			event.locals.allMemberships = typedMemberships;

			// Determine active org from cookie, fallback to first membership
			const activeOrgId = event.cookies.get('active_org_id');
			const membership = activeOrgId
				? (typedMemberships.find((m) => m.organization_id === activeOrgId) ?? typedMemberships[0])
				: typedMemberships[0];

			const org = membership?.organizations;

			if (org?.org_type === 'retailer') {
				// Retailer orgs ARE buyers. They reach the buyer portal (/dashboard),
				// not /insight, so we set isBuyer with an empty buyer context and skip
				// the rep/brand brand-scope + SSO-enforcement setup entirely. Shopping
				// access (buyerBrandIds) arrives in SP3 via connection-derived access.
				event.locals.user = profile;
				event.locals.membership = membership;
				event.locals.organization = org;
				event.locals.orgType = 'retailer';
				event.locals.isBuyer = true;
				event.locals.buyerAccounts = [];
				event.locals.buyerBrandIds = [];
				event.locals.brandScope = null;
				event.locals.scopedBrandNames = null;
			} else {
				// Rep/brand org member path
				let brandScope: string[] | null = null;
				let scopedBrandNames: string[] | null = null;
				if (['member', 'sales', 'guest'].includes(membership.role)) {
					const { data: brandAccess } = await supabase
						.from('member_brand_access')
						.select('brand_id, brands(name)')
						.eq('member_id', membership.id);
					if (brandAccess?.length) {
						const rows = brandAccess as BrandAccessRow[];
						brandScope = rows.map((b) => b.brand_id);
						scopedBrandNames = rows
							.map((b) => {
								const brand = b.brands;
								if (!brand) return undefined;
								if (Array.isArray(brand)) return brand[0]?.name;
								return brand.name;
							})
							.filter((n): n is string => Boolean(n));
					}
				}

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
							const isSsoSession =
								user.app_metadata?.provider === 'sso' ||
								user.identities?.some((i: SsoIdentity) => i.provider === 'sso');
							if (!isSsoSession) {
								await supabase.auth.signOut();
								throw redirect(303, '/login?error=sso_required');
							}
						}
					}
				}
			}
		} else {
			// Not an org member — check if the user is a legacy invited buyer
			// (account_users, no membership). Retailer-org members are buyers too
			// but resolve in the membership branch above, since they have a
			// membership row.
			const buyerContext = await resolveBuyerContext(supabase, supabaseAdmin, user.id);

			if (buyerContext.isBuyer) {
				event.locals.user = profile;
				event.locals.isBuyer = true;
				event.locals.buyerAccounts = buyerContext.buyerAccounts;
				event.locals.buyerBrandIds = buyerContext.buyerBrandIds;
				// An invited buyer whose account has no brand access yet has no org,
				// so organization stays null. Only overwrite the null default when we
				// actually resolved an org.
				if (buyerContext.organization) {
					event.locals.organization = buyerContext.organization;
				}
			} else {
				// No org membership and not a buyer — redirect to onboarding. A
				// retailer signup mid-wizard also lands here (createRetailer only
				// creates the org + membership at step 3), so /onboarding is correct.
				event.locals.user = profile;
				if (
					!event.url.pathname.startsWith('/onboarding') &&
					!event.url.pathname.startsWith('/api/')
				) {
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
