/**
 * SCO-204: create_account_with_locations inserts an account and its locations
 * in one transaction, keyed by a client id so a retry is a replay.
 *
 * It is SECURITY INVOKER and called through locals.supabase, so these tests
 * run as fixture personas: the existing INSERT policies on accounts and
 * account_locations still decide who may create what.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { personaClient } from './setup/fixture.js';

const created: string[] = [];

function args(accountId: string, orgId: string, locations: Array<Record<string, unknown>> = []) {
	created.push(accountId);
	return {
		p_account_id: accountId,
		p_org_id: orgId,
		p_account: {
			business_name: `SCO-204 ${accountId.slice(0, 8)}`,
			contact_first_name: 'Ada',
			contact_last_name: 'Lovelace'
		},
		p_locations: [
			{ id: randomUUID(), label: 'Primary', is_default: true, sort_order: 0 },
			...locations
		]
	};
}

async function rowsFor(accountId: string) {
	const admin = adminClient();
	const [acct, locs] = await Promise.all([
		admin.from('accounts').select('id').eq('id', accountId),
		admin.from('account_locations').select('id').eq('account_id', accountId)
	]);
	return { accounts: acct.data?.length ?? 0, locations: locs.data?.length ?? 0 };
}

afterAll(async () => {
	if (created.length === 0) return;
	const admin = adminClient();
	await admin.from('account_locations').delete().in('account_id', created);
	await admin.from('accounts').delete().in('id', created);
});

describe('create_account_with_locations', () => {
	it('creates the account and every location together', async () => {
		const client = await personaClient('brandAAdmin');
		const id = randomUUID();
		const { data, error } = await client
			.rpc('create_account_with_locations', args(id, RLS_IDS.orgBrandA, [{ label: 'Annex' }]))
			.single();
		expect(error).toBeNull();
		expect(data).toEqual({ account_id: id, inserted: true });
		expect(await rowsFor(id)).toEqual({ accounts: 1, locations: 2 });
	});

	it('replays a known id without inserting anything', async () => {
		const client = await personaClient('brandAAdmin');
		const id = randomUUID();
		const first = args(id, RLS_IDS.orgBrandA);
		await client.rpc('create_account_with_locations', first).single();
		const { data, error } = await client
			.rpc('create_account_with_locations', {
				...first,
				p_locations: [{ id: randomUUID(), label: 'Second try' }]
			})
			.single();
		expect(error).toBeNull();
		expect(data).toEqual({ account_id: id, inserted: false });
		expect(await rowsFor(id)).toEqual({ accounts: 1, locations: 1 });
	});

	it('rolls back the account when a location fails', async () => {
		const client = await personaClient('brandAAdmin');
		const id = randomUUID();
		// label is NOT NULL, so the second location fails after the account row.
		const { error } = await client
			.rpc('create_account_with_locations', args(id, RLS_IDS.orgBrandA, [{ label: null }]))
			.single();
		expect(error).not.toBeNull();
		expect(await rowsFor(id)).toEqual({ accounts: 0, locations: 0 });
	});

	it('refuses an id that already belongs to another org', async () => {
		const id = randomUUID();
		const brandB = await personaClient('brandBAdmin');
		await brandB.rpc('create_account_with_locations', args(id, RLS_IDS.orgBrandB)).single();

		const brandA = await personaClient('brandAAdmin');
		const { data, error } = await brandA
			.rpc('create_account_with_locations', args(id, RLS_IDS.orgBrandA))
			.single();
		expect(data).toBeNull();
		expect(error?.code).toBe('23505');
		expect(await rowsFor(id)).toEqual({ accounts: 1, locations: 1 });
	});

	it('still enforces the insert policy: sales cannot create accounts', async () => {
		const client = await personaClient('brandASales');
		const id = randomUUID();
		const { error } = await client
			.rpc('create_account_with_locations', args(id, RLS_IDS.orgBrandA))
			.single();
		expect(error?.code).toBe('42501');
		expect(await rowsFor(id)).toEqual({ accounts: 0, locations: 0 });
	});

	it('refuses a signed-in user creating in an org they do not belong to', async () => {
		const client = await personaClient('brandBAdmin');
		const id = randomUUID();
		const { error } = await client
			.rpc('create_account_with_locations', args(id, RLS_IDS.orgBrandA))
			.single();
		expect(error?.code).toBe('42501');
		expect(await rowsFor(id)).toEqual({ accounts: 0, locations: 0 });
	});
});
