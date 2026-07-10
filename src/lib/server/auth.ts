/**
 * Auth context loading for `hooks.server.ts`.
 *
 * The server hook resolves a request's identity into one of four shapes —
 * system admin, org member, buyer, or a not-yet-onboarded user — and populates
 * `event.locals` accordingly. That logic lives here, split from the hook so the
 * branching is unit-testable without standing up a full request.
 *
 * Design split:
 *   - `loadUserContext()` does the data loading and returns a discriminated
 *     result. It performs NO redirects or sign-outs.
 *   - The hook owns side effects: it calls `applyUserContext()` to populate
 *     locals, then acts on the result (redirect to /system, enforce SSO, send
 *     to /onboarding).
 *
 * This preserves the exact semantics of the original inline hook code.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type {
	Profile,
	Organization,
	OrganizationMember,
	OrgType,
	AccountUser
} from '$lib/types/database.js';
import { isSystemAdminEmail } from '$lib/server/system-admin.js';
import { resolveRetailerBuyerContext } from '$lib/server/buyer-context.js';

export type MembershipWithOrg = OrganizationMember & { organizations: Organization };
type BrandAccessRow = { brand_id: string; brands?: { name?: string } | { name?: string }[] | null };
export type BuyerAccountRow = AccountUser & {
	account_id: string;
	accounts?: { organization_id?: string } | null;
};
type SsoIdentity = { provider?: string };

/** Roles whose brand visibility is narrowed by `member_brand_access`. */
export const BRAND_SCOPED_ROLES = ['member', 'sales', 'guest'] as const;

export function roleHasBrandScoping(role: string | null | undefined): boolean {
	return BRAND_SCOPED_ROLES.includes(role as (typeof BRAND_SCOPED_ROLES)[number]);
}

/**
 * Pick the active membership: the one matching the `active_org_id` cookie,
 * falling back to the first membership when the cookie is absent or stale.
 * Assumes `memberships` is non-empty (callers guard on length).
 */
export function resolveActiveMembership(
	memberships: MembershipWithOrg[],
	activeOrgId: string | undefined
): MembershipWithOrg {
	if (!activeOrgId) return memberships[0];
	return memberships.find((m) => m.organization_id === activeOrgId) ?? memberships[0];
}

/** Flatten `member_brand_access` rows into scoped brand IDs + names. */
export function extractBrandScope(brandAccess: BrandAccessRow[] | null | undefined): {
	brandScope: string[] | null;
	scopedBrandNames: string[] | null;
} {
	if (!brandAccess?.length) return { brandScope: null, scopedBrandNames: null };
	const brandScope = brandAccess.map((b) => b.brand_id);
	const scopedBrandNames = brandAccess
		.map((b) => {
			const brand = b.brands;
			if (!brand) return undefined;
			if (Array.isArray(brand)) return brand[0]?.name;
			return brand.name;
		})
		.filter((n): n is string => Boolean(n));
	return { brandScope, scopedBrandNames };
}

/** True when the authenticated session was established via an SSO provider. */
export function isSsoSession(user: User): boolean {
	return (
		user.app_metadata?.provider === 'sso' ||
		(user.identities?.some((i: SsoIdentity) => i.provider === 'sso') ?? false)
	);
}

export type UserContextResult =
	| { kind: 'system_admin'; profile: Profile | null }
	| {
			kind: 'org_member';
			profile: Profile | null;
			allMemberships: MembershipWithOrg[];
			membership: MembershipWithOrg;
			organization: Organization | null;
			orgType: OrgType;
			brandScope: string[] | null;
			scopedBrandNames: string[] | null;
			ssoRequired: boolean;
	  }
	| {
			kind: 'buyer';
			profile: Profile | null;
			buyerAccounts: BuyerAccountRow[];
			buyerBrandIds: string[] | null;
			organization: Organization | null;
	  }
	| {
			// A retailer-org member is a hybrid: an org member (membership,
			// allMemberships, org) AND a buyer (isBuyer, buyerAccounts). Their
			// shopping scope resolves through accounts linked to the retailer org via
			// `retailer_org_id`, not `account_users`. They land on the buyer portal.
			kind: 'retailer';
			profile: Profile | null;
			allMemberships: MembershipWithOrg[];
			membership: MembershipWithOrg;
			organization: Organization | null;
			buyerAccounts: BuyerAccountRow[];
			buyerBrandIds: string[] | null;
	  }
	| { kind: 'onboarding'; profile: Profile | null };

/**
 * Determine whether an org member's session must be rejected because their org
 * enforces SSO for their email domain but the session is not an SSO session.
 */
async function isSsoEnforcementBreached(
	admin: SupabaseClient,
	org: Organization | null | undefined,
	user: User
): Promise<boolean> {
	if (!org?.sso_enforced || !user.email) return false;
	const emailDomain = user.email.split('@')[1]?.toLowerCase();
	if (!emailDomain) return false;

	const { data: ssoProvider } = await admin
		.from('organization_sso_providers')
		.select('id')
		.eq('organization_id', org.id)
		.eq('domain', emailDomain)
		.limit(1)
		.single();

	if (!ssoProvider) return false;
	return !isSsoSession(user);
}

/**
 * Load the full identity context for an authenticated user on a protected route.
 *
 * @param supabase  request-scoped client (RLS applies)
 * @param admin     service-role client (bypasses RLS for profile/org lookups)
 * @param user      the authenticated user from `safeGetSession`
 * @param activeOrgId  value of the `active_org_id` cookie, if any
 */
export async function loadUserContext(
	supabase: SupabaseClient,
	admin: SupabaseClient,
	user: User,
	activeOrgId: string | undefined
): Promise<UserContextResult> {
	// System super-admin: above-org identity, no org/buyer context.
	if (isSystemAdminEmail(user.email)) {
		const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single();
		return { kind: 'system_admin', profile: profile ?? null };
	}

	const [{ data: profile }, { data: allMemberships }] = await Promise.all([
		admin.from('profiles').select('*').eq('id', user.id).single(),
		supabase.from('organization_members').select('*, organizations(*)').eq('profile_id', user.id)
	]);

	if (allMemberships?.length) {
		const typedMemberships = allMemberships as MembershipWithOrg[];
		const membership = resolveActiveMembership(typedMemberships, activeOrgId);
		const org = membership?.organizations ?? null;

		// Retailer-org members are buyers. They skip the rep/brand brand-scope +
		// SSO-enforcement setup entirely; shopping access resolves through the
		// brands' `accounts` rows linked to this retailer org via `retailer_org_id`
		// (the extended `get_buyer_account_ids()` RLS helper mirrors this).
		if (org?.org_type === 'retailer') {
			const { buyerAccounts, buyerBrandIds } = await resolveRetailerBuyerContext(
				admin,
				org.id,
				user.id
			);
			return {
				kind: 'retailer',
				profile: profile ?? null,
				allMemberships: typedMemberships,
				membership,
				organization: org,
				buyerAccounts,
				buyerBrandIds
			};
		}

		let brandScope: string[] | null = null;
		let scopedBrandNames: string[] | null = null;
		if (roleHasBrandScoping(membership.role)) {
			const { data: brandAccess } = await supabase
				.from('member_brand_access')
				.select('brand_id, brands(name)')
				.eq('member_id', membership.id);
			({ brandScope, scopedBrandNames } = extractBrandScope(brandAccess as BrandAccessRow[]));
		}

		const ssoRequired = await isSsoEnforcementBreached(admin, org, user);

		return {
			kind: 'org_member',
			profile: profile ?? null,
			allMemberships: typedMemberships,
			membership,
			organization: org,
			orgType: (org?.org_type as OrgType) ?? 'rep',
			brandScope,
			scopedBrandNames,
			ssoRequired
		};
	}

	// Not an org member — check for buyer access.
	const { data: buyerAccess } = await supabase
		.from('account_users')
		.select('*, accounts(*, organizations(*))')
		.eq('profile_id', user.id);

	if (buyerAccess?.length) {
		const typedBuyerAccess = buyerAccess as BuyerAccountRow[];

		const accountIds = typedBuyerAccess.map((a) => a.account_id);
		const { data: brandAccess } = await admin
			.from('account_brand_access')
			.select('brand_id')
			.in('account_id', accountIds);
		const buyerBrandIds =
			(brandAccess as Array<{ brand_id: string }> | null)?.map((b) => b.brand_id) ?? null;

		let organization: Organization | null = null;
		const orgId = typedBuyerAccess[0]?.accounts?.organization_id;
		if (orgId) {
			const { data: org } = await admin.from('organizations').select('*').eq('id', orgId).single();
			if (org) organization = org;
		}

		return {
			kind: 'buyer',
			profile: profile ?? null,
			buyerAccounts: typedBuyerAccess,
			buyerBrandIds,
			organization
		};
	}

	return { kind: 'onboarding', profile: profile ?? null };
}

/** Apply a resolved context onto `event.locals`, mirroring the original hook. */
export function applyUserContext(locals: App.Locals, result: UserContextResult): void {
	switch (result.kind) {
		case 'system_admin':
			locals.user = result.profile;
			locals.isSystemAdmin = true;
			return;
		case 'org_member':
			locals.user = result.profile;
			locals.allMemberships = result.allMemberships;
			locals.membership = result.membership;
			locals.organization = result.organization;
			locals.orgType = result.orgType;
			locals.brandScope = result.brandScope;
			locals.scopedBrandNames = result.scopedBrandNames;
			return;
		case 'buyer':
			locals.user = result.profile;
			locals.isBuyer = true;
			locals.buyerAccounts = result.buyerAccounts;
			locals.buyerBrandIds = result.buyerBrandIds;
			if (result.organization) locals.organization = result.organization;
			return;
		case 'retailer':
			// Hybrid: org-member locals (for the org switcher) AND buyer locals (for
			// the portal). orgType='retailer'; brand-scope is not applicable.
			locals.user = result.profile;
			locals.allMemberships = result.allMemberships;
			locals.membership = result.membership;
			locals.organization = result.organization;
			locals.orgType = 'retailer';
			locals.isBuyer = true;
			locals.buyerAccounts = result.buyerAccounts;
			locals.buyerBrandIds = result.buyerBrandIds;
			locals.brandScope = null;
			locals.scopedBrandNames = null;
			return;
		case 'onboarding':
			locals.user = result.profile;
			return;
	}
}
