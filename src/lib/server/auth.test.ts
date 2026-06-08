import { describe, it, expect } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { createMockSupabase } from '$lib/test-helpers/supabase-mock.js';
import {
	resolveActiveMembership,
	extractBrandScope,
	isSsoSession,
	roleHasBrandScoping,
	loadUserContext,
	applyUserContext,
	type MembershipWithOrg,
	type UserContextResult
} from './auth.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
	return {
		id: 'user-1',
		email: 'rep@example.com',
		app_metadata: {},
		user_metadata: {},
		aud: 'authenticated',
		created_at: '2024-01-01',
		identities: [],
		...overrides
	} as User;
}

function makeMembership(overrides: Partial<MembershipWithOrg> = {}): MembershipWithOrg {
	return {
		id: 'mem-1',
		organization_id: 'org-1',
		profile_id: 'user-1',
		role: 'owner',
		organizations: { id: 'org-1', org_type: 'rep', sso_enforced: false },
		...overrides
	} as unknown as MembershipWithOrg;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

describe('roleHasBrandScoping', () => {
	it('scopes member, sales, and guest', () => {
		expect(roleHasBrandScoping('member')).toBe(true);
		expect(roleHasBrandScoping('sales')).toBe(true);
		expect(roleHasBrandScoping('guest')).toBe(true);
	});

	it('does not scope admin or owner', () => {
		expect(roleHasBrandScoping('admin')).toBe(false);
		expect(roleHasBrandScoping('owner')).toBe(false);
		expect(roleHasBrandScoping(null)).toBe(false);
		expect(roleHasBrandScoping(undefined)).toBe(false);
	});
});

describe('resolveActiveMembership', () => {
	const a = makeMembership({ id: 'mem-a', organization_id: 'org-a' });
	const b = makeMembership({ id: 'mem-b', organization_id: 'org-b' });

	it('returns the membership matching the active_org_id cookie', () => {
		expect(resolveActiveMembership([a, b], 'org-b')).toBe(b);
	});

	it('falls back to the first membership when no cookie is set', () => {
		expect(resolveActiveMembership([a, b], undefined)).toBe(a);
	});

	it('falls back to the first membership when the cookie is stale', () => {
		expect(resolveActiveMembership([a, b], 'org-deleted')).toBe(a);
	});
});

describe('extractBrandScope', () => {
	it('returns nulls for empty or missing input', () => {
		expect(extractBrandScope(null)).toEqual({ brandScope: null, scopedBrandNames: null });
		expect(extractBrandScope([])).toEqual({ brandScope: null, scopedBrandNames: null });
	});

	it('maps brand IDs and names from object-shaped joins', () => {
		const result = extractBrandScope([
			{ brand_id: 'b1', brands: { name: 'Acme' } },
			{ brand_id: 'b2', brands: { name: 'Globex' } }
		]);
		expect(result.brandScope).toEqual(['b1', 'b2']);
		expect(result.scopedBrandNames).toEqual(['Acme', 'Globex']);
	});

	it('handles array-shaped joins and filters out missing names', () => {
		const result = extractBrandScope([
			{ brand_id: 'b1', brands: [{ name: 'Acme' }] },
			{ brand_id: 'b2', brands: null }
		]);
		expect(result.brandScope).toEqual(['b1', 'b2']);
		expect(result.scopedBrandNames).toEqual(['Acme']);
	});
});

describe('isSsoSession', () => {
	it('is true when app_metadata.provider is sso', () => {
		expect(isSsoSession(makeUser({ app_metadata: { provider: 'sso' } }))).toBe(true);
	});

	it('is true when an identity provider is sso', () => {
		expect(
			isSsoSession(makeUser({ identities: [{ provider: 'sso' }] as User['identities'] }))
		).toBe(true);
	});

	it('is false for password/oauth sessions', () => {
		expect(isSsoSession(makeUser({ app_metadata: { provider: 'email' } }))).toBe(false);
	});
});

// ── loadUserContext: identity branching ─────────────────────────────────────

describe('loadUserContext', () => {
	it('resolves the system super-admin to the system_admin branch', async () => {
		const admin = createMockSupabase({ profiles: { data: { id: 'sa-1' } } });
		const supabase = createMockSupabase({});
		const result = await loadUserContext(
			supabase,
			admin,
			makeUser({ id: 'sa-1', email: 'scott@threadline.systems' }),
			undefined
		);
		expect(result.kind).toBe('system_admin');
	});

	it('resolves an org member with brand scope for a sales role', async () => {
		const membership = makeMembership({
			id: 'mem-1',
			role: 'sales',
			organizations: { id: 'org-1', org_type: 'brand', sso_enforced: false }
		} as Partial<MembershipWithOrg>);
		const supabase = createMockSupabase({
			organization_members: { data: [membership] },
			member_brand_access: { data: [{ brand_id: 'b1', brands: { name: 'Acme' } }] }
		});
		const admin = createMockSupabase({
			profiles: { data: { id: 'user-1' } },
			organization_sso_providers: { data: null }
		});

		const result = await loadUserContext(supabase, admin, makeUser(), undefined);
		expect(result.kind).toBe('org_member');
		if (result.kind !== 'org_member') return;
		expect(result.orgType).toBe('brand');
		expect(result.brandScope).toEqual(['b1']);
		expect(result.scopedBrandNames).toEqual(['Acme']);
		expect(result.ssoRequired).toBe(false);
	});

	it('does not load brand scope for an owner role', async () => {
		const supabase = createMockSupabase({
			organization_members: { data: [makeMembership({ role: 'owner' })] }
		});
		const admin = createMockSupabase({ profiles: { data: { id: 'user-1' } } });

		const result = await loadUserContext(supabase, admin, makeUser(), undefined);
		expect(result.kind).toBe('org_member');
		if (result.kind !== 'org_member') return;
		expect(result.brandScope).toBeNull();
		expect(result.scopedBrandNames).toBeNull();
	});

	it('flags ssoRequired when the org enforces SSO and the session is not SSO', async () => {
		const supabase = createMockSupabase({
			organization_members: {
				data: [
					makeMembership({
						organizations: { id: 'org-1', org_type: 'rep', sso_enforced: true }
					} as Partial<MembershipWithOrg>)
				]
			}
		});
		const admin = createMockSupabase({
			profiles: { data: { id: 'user-1' } },
			organization_sso_providers: { data: { id: 'sso-1' } }
		});

		const result = await loadUserContext(
			supabase,
			admin,
			makeUser({ email: 'rep@enforced.com', app_metadata: { provider: 'email' } }),
			undefined
		);
		expect(result.kind).toBe('org_member');
		if (result.kind !== 'org_member') return;
		expect(result.ssoRequired).toBe(true);
	});

	it('resolves a buyer when there are no memberships but account access exists', async () => {
		const supabase = createMockSupabase({
			organization_members: { data: [] },
			account_users: {
				data: [{ account_id: 'acct-1', accounts: { organization_id: 'org-9' } }]
			}
		});
		const admin = createMockSupabase({
			profiles: { data: { id: 'user-1' } },
			account_brand_access: { data: [{ brand_id: 'b1' }, { brand_id: 'b2' }] },
			organizations: { data: { id: 'org-9' } }
		});

		const result = await loadUserContext(supabase, admin, makeUser(), undefined);
		expect(result.kind).toBe('buyer');
		if (result.kind !== 'buyer') return;
		expect(result.buyerBrandIds).toEqual(['b1', 'b2']);
		expect(result.organization).toEqual({ id: 'org-9' });
	});

	it('resolves to onboarding when there are no memberships and no buyer access', async () => {
		const supabase = createMockSupabase({
			organization_members: { data: [] },
			account_users: { data: [] }
		});
		const admin = createMockSupabase({ profiles: { data: { id: 'user-1' } } });

		const result = await loadUserContext(supabase, admin, makeUser(), undefined);
		expect(result.kind).toBe('onboarding');
	});
});

// ── applyUserContext: locals population ─────────────────────────────────────

describe('applyUserContext', () => {
	function blankLocals(): App.Locals {
		return {
			isBuyer: false,
			buyerAccounts: null,
			buyerBrandIds: null,
			isSystemAdmin: false,
			orgType: 'rep',
			allMemberships: []
		} as unknown as App.Locals;
	}

	it('sets isSystemAdmin for the system_admin branch', () => {
		const locals = blankLocals();
		applyUserContext(locals, { kind: 'system_admin', profile: { id: 'sa' } } as UserContextResult);
		expect(locals.isSystemAdmin).toBe(true);
	});

	it('sets buyer flags for the buyer branch', () => {
		const locals = blankLocals();
		applyUserContext(locals, {
			kind: 'buyer',
			profile: { id: 'u' },
			buyerAccounts: [],
			buyerBrandIds: ['b1'],
			organization: { id: 'org-9' }
		} as unknown as UserContextResult);
		expect(locals.isBuyer).toBe(true);
		expect(locals.buyerBrandIds).toEqual(['b1']);
		expect(locals.organization).toEqual({ id: 'org-9' });
	});
});
