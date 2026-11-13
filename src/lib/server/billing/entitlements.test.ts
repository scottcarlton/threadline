import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { checkConnectionLimit, checkSeatLimit, getOrgLimits } from './entitlements';

type Sub = { plan: string | null; status: string | null } | null;

/**
 * A fake admin client answering the few queries the gates make. Subscriptions
 * come from `subs` by org id; counts from `counts` keyed by table plus the
 * org filter, e.g. "org_connections:rep_org_id=rep-1".
 */
function fakeAdmin(subs: Record<string, Sub>, counts: Record<string, number>) {
	const queried: string[] = [];
	const client = {
		from(table: string) {
			const filters: Record<string, string> = {};
			const chain = {
				select: () => chain,
				eq: (col: string, value: string) => {
					filters[col] = value;
					return chain;
				},
				neq: () => chain,
				is: () => chain,
				gt: () => chain,
				maybeSingle: async () => {
					queried.push(table);
					return { data: subs[filters.organization_id] ?? null, error: null };
				},
				then(resolve: (v: { count: number; error: null }) => void) {
					queried.push(table);
					const key =
						table === 'org_connections'
							? `${table}:${filters.rep_org_id ? `rep_org_id=${filters.rep_org_id}` : `brand_org_id=${filters.brand_org_id}`}`
							: `${table}:${filters.organization_id}`;
					resolve({ count: counts[key] ?? 0, error: null });
				}
			};
			return chain;
		}
	};
	return { admin: client as unknown as SupabaseClient, queried };
}

const original = env.BETA_ENABLED;
afterEach(() => {
	env.BETA_ENABLED = original;
});

describe('during the beta', () => {
	beforeEach(() => {
		delete env.BETA_ENABLED;
	});

	it('enforces nothing and reads nothing', async () => {
		const { admin, queried } = fakeAdmin({}, { 'organization_members:org-1': 99 });
		expect(await getOrgLimits(admin, 'org-1', 'rep')).toBeNull();
		expect(
			await checkSeatLimit(admin, { id: 'org-1', orgType: 'rep' }, 'member', 'invite')
		).toEqual({ ok: true });
		expect(
			await checkConnectionLimit(admin, { repOrgId: 'org-1', brandOrgId: 'org-2' }, 'rep')
		).toEqual({ ok: true });
		expect(queried).toEqual([]);
	});
});

describe('after the beta', () => {
	beforeEach(() => {
		env.BETA_ENABLED = 'false';
	});

	describe('checkSeatLimit', () => {
		const rep = { id: 'rep-1', orgType: 'rep' as const };

		it('lets guests in without counting', async () => {
			const { admin, queried } = fakeAdmin({}, { 'organization_members:rep-1': 50 });
			expect(await checkSeatLimit(admin, rep, 'guest', 'invite')).toEqual({ ok: true });
			expect(queried).toEqual([]);
		});

		it('counts pending invitations at invite time', async () => {
			const { admin } = fakeAdmin(
				{ 'rep-1': { plan: 'rep_max_pro', status: 'active' } },
				{ 'organization_members:rep-1': 2, 'invitations:rep-1': 1 }
			);
			const result = await checkSeatLimit(admin, rep, 'sales', 'invite');
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.message).toContain('3 seats');
		});

		it('ignores pending invitations at accept time', async () => {
			const { admin, queried } = fakeAdmin(
				{ 'rep-1': { plan: 'rep_max_pro', status: 'active' } },
				{ 'organization_members:rep-1': 2, 'invitations:rep-1': 5 }
			);
			expect(await checkSeatLimit(admin, rep, 'member', 'accept')).toEqual({ ok: true });
			expect(queried).not.toContain('invitations');
		});

		it('holds an org with no subscription to the free tier', async () => {
			const { admin } = fakeAdmin({}, { 'organization_members:rep-1': 1 });
			const result = await checkSeatLimit(admin, rep, 'member', 'invite');
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.message).toContain('1 seat,');
		});

		it('does not limit seats where the plan has none', async () => {
			const { admin } = fakeAdmin(
				{ 'brand-1': { plan: 'brand_max', status: 'active' } },
				{ 'organization_members:brand-1': 400 }
			);
			expect(
				await checkSeatLimit(admin, { id: 'brand-1', orgType: 'brand' }, 'admin', 'invite')
			).toEqual({ ok: true });
		});
	});

	describe('checkConnectionLimit', () => {
		const pair = { repOrgId: 'rep-1', brandOrgId: 'brand-1' };
		const paid = {
			'rep-1': { plan: 'rep_starter', status: 'active' },
			'brand-1': { plan: 'brand_starter', status: 'active' }
		};

		it('allows a connection with room on both sides', async () => {
			const { admin } = fakeAdmin(paid, {
				'org_connections:rep_org_id=rep-1': 2,
				'org_connections:brand_org_id=brand-1': 4
			});
			expect(await checkConnectionLimit(admin, pair, 'rep')).toEqual({ ok: true });
		});

		it('refuses when the rep is full, worded for whoever is acting', async () => {
			const counts = { 'org_connections:rep_org_id=rep-1': 3 };
			const asRep = await checkConnectionLimit(fakeAdmin(paid, counts).admin, pair, 'rep');
			const asBrand = await checkConnectionLimit(fakeAdmin(paid, counts).admin, pair, 'brand');
			expect(asRep.ok || asRep.message).toContain('Your plan includes 3 brand connections');
			expect(asBrand.ok || asBrand.message).toContain("This rep's plan");
		});

		it('refuses when the brand is full', async () => {
			const counts = { 'org_connections:brand_org_id=brand-1': 5 };
			const asBrand = await checkConnectionLimit(fakeAdmin(paid, counts).admin, pair, 'brand');
			const asRep = await checkConnectionLimit(fakeAdmin(paid, counts).admin, pair, 'rep');
			expect(asBrand.ok || asBrand.message).toContain('Your plan includes 5 connected reps');
			expect(asRep.ok || asRep.message).toContain("This brand's plan");
		});

		it('never counts a side whose plan is unlimited', async () => {
			const { admin, queried } = fakeAdmin(
				{
					'rep-1': { plan: 'rep_pro', status: 'active' },
					'brand-1': { plan: 'brand_max', status: 'active' }
				},
				{}
			);
			expect(await checkConnectionLimit(admin, pair, 'rep')).toEqual({ ok: true });
			expect(queried).not.toContain('org_connections');
		});
	});
});
