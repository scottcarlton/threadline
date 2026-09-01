import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { PERSONA_IDS, loadPersonaIds } from './setup/fixture.js';

beforeAll(loadPersonaIds);

/**
 * connection_invites, buyer_invitations, and connection_member_invites
 * carry SELECT policies with USING (true), so an unauthenticated visitor
 * can resolve an invite by code or token. invitations has a slightly
 * different-looking policy ("Invitation readable by token holder or org
 * admin") but it is equivalent for anon in practice: its first disjunct is
 * `auth.uid() IS NULL AND token IS NOT NULL`, and token is a NOT NULL
 * column, so that disjunct is always true for an unauthenticated request
 * regardless of which row it targets. That means anon can read every row
 * in all four tables. These tests pin the current exposure so any
 * widening or narrowing shows up as a failing test rather than a silent
 * change.
 *
 * If one fails after a policy change, decide deliberately whether the new
 * exposure is intended before updating the expectation.
 */
describe('public-by-token tables', () => {
	it('anon can resolve a connection invite (documented exposure)', async () => {
		// Inserting a brand org fires trg_create_connection_invite, so Brand A
		// already has one.
		const { data, error } = await anonClient()
			.from('connection_invites')
			.select('id, brand_org_id')
			.eq('brand_org_id', RLS_IDS.orgBrandA);
		expect(error).toBeNull();
		expect((data ?? []).length).toBeGreaterThan(0);
	});

	it('anon reading invitations is pinned to the current exposure', async () => {
		const admin = adminClient();
		const { data, error } = await admin
			.from('invitations')
			.insert({
				organization_id: RLS_IDS.orgBrandA,
				email: 'invitee@rls-test.threadline.local',
				role: 'member',
				invited_by: PERSONA_IDS.brandAAdmin
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		const inviteId = (data as { id: string }).id;

		try {
			const { data: anonRows } = await anonClient()
				.from('invitations')
				.select('id, email')
				.eq('id', inviteId);
			// Documents what anon actually gets. If this flips, the policy
			// changed and someone needs to have decided that on purpose.
			expect((anonRows ?? []).length).toBe(1);
		} finally {
			await admin.from('invitations').delete().eq('id', inviteId);
		}
	});

	it('anon cannot write to any invite table', async () => {
		const anon = anonClient();
		const attempts: Array<[string, Record<string, unknown>]> = [
			[
				'invitations',
				{
					organization_id: RLS_IDS.orgBrandA,
					email: 'forged@rls-test.threadline.local',
					role: 'admin'
				}
			],
			[
				'buyer_invitations',
				{
					organization_id: RLS_IDS.orgBrandA,
					account_id: RLS_IDS.accountBrandA,
					email: 'forged@rls-test.threadline.local'
				}
			],
			['connection_invites', { brand_org_id: RLS_IDS.orgBrandA, code: 'RLSFORGED' }]
		];
		for (const [table, row] of attempts) {
			const { error } = await anon.from(table).insert(row);
			expect(error?.code, `anon insert into ${table} must be denied`).toBe('42501');
		}
	});

	it('anon cannot redirect an invite by updating it', async () => {
		const { data, error } = await anonClient()
			.from('connection_invites')
			.update({ brand_org_id: RLS_IDS.orgRepB })
			.eq('brand_org_id', RLS_IDS.orgBrandA)
			.select('id');
		if (error) {
			expect(error.code).toBe('42501');
		} else {
			expect(data ?? []).toEqual([]);
		}
	});
});
