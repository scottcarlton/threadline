/**
 * SCO-207: the account half of POST /api/sync/accounts, run as fixture
 * personas against the real database. createAccount is what the endpoint
 * calls with locals.supabase, so RLS decides who may create accounts where.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { personaClient, type RlsPersona } from './setup/fixture.js';
import { createAccount } from '../../src/lib/server/accounts/create-account.js';
import { syncAccountPayloadSchema } from '../../src/lib/schemas/account.js';

const created: string[] = [];

afterAll(async () => {
	if (!created.length) return;
	const admin = adminClient();
	await admin.from('account_locations').delete().in('account_id', created);
	await admin.from('accounts').delete().in('id', created);
});

function payload(orgId: string) {
	const id = randomUUID();
	created.push(id);
	return syncAccountPayloadSchema.parse({
		organization_id: orgId,
		account: {
			id,
			primaryLocationId: randomUUID(),
			business: {
				name: `SCO-207 ${id.slice(0, 8)}`,
				address: { city: 'Austin', state: 'TX' },
				additionalLocations: [{ id: randomUUID(), label: 'Annex', address: {}, contact: {} }]
			},
			contact: { firstName: 'Ada', lastName: 'Lovelace', email: '' }
		}
	});
}

async function sync(persona: RlsPersona, p: ReturnType<typeof payload>) {
	const audit = { record: vi.fn() };
	const emit = vi.fn();
	const outcome = await createAccount({
		supabase: await personaClient(persona),
		audit: audit as never,
		payload: p,
		origin: 'http://localhost',
		fetch: vi.fn() as never,
		emit
	});
	return { outcome, audit, emit };
}

async function locationCount(accountId: string) {
	const { data } = await adminClient()
		.from('account_locations')
		.select('id')
		.eq('account_id', accountId);
	return data?.length ?? 0;
}

describe('sync account', () => {
	it('creates the account and locations once, and replays with no side effects', async () => {
		const p = payload(RLS_IDS.orgBrandA);
		const first = await sync('brandAAdmin', p);
		expect(first.outcome).toMatchObject({ ok: true, inserted: true, accountId: p.account.id });
		expect(first.audit.record).toHaveBeenCalledTimes(1);
		expect(first.emit).toHaveBeenCalledTimes(1);
		expect(await locationCount(p.account.id)).toBe(2);

		const again = await sync('brandAAdmin', p);
		expect(again.outcome).toMatchObject({ ok: true, inserted: false });
		expect(again.audit.record).not.toHaveBeenCalled();
		expect(again.emit).not.toHaveBeenCalled();
		expect(await locationCount(p.account.id)).toBe(2);
	});

	it('refuses an org the user does not belong to', async () => {
		const p = payload(RLS_IDS.orgBrandA);
		const { outcome } = await sync('brandBAdmin', p);
		expect(outcome).toMatchObject({ ok: false, status: 403 });
	});

	it('refuses a role the insert policy excludes', async () => {
		const p = payload(RLS_IDS.orgBrandA);
		const { outcome } = await sync('brandASales', p);
		expect(outcome).toMatchObject({ ok: false, status: 403 });
	});
});
