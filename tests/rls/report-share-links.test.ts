import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, personaClient, PERSONA_IDS } from './setup/fixture.js';
import { expectHidden, expectUpdateDenied, expectVisible } from './setup/assert.js';

/**
 * RLS for `report_share_links` (SCO-151).
 *
 * The table holds frozen copies of reports behind public links, so reading
 * it is an admin/owner act in the owning org and nobody writes it except the
 * service role, behind the app's own role check. Members, sales, guests, other
 * orgs and anon see nothing; no signed-in role can insert or edit a row.
 */

let linkId: string;

beforeAll(async () => {
	await loadPersonaIds();
	const { data, error } = await adminClient()
		.from('report_share_links')
		.insert({
			organization_id: RLS_IDS.orgBrandA,
			report: 'pipeline',
			title: 'Order Pipeline',
			filter_label: 'Current pipeline',
			snapshot: { rows: [] },
			token_hash: `rls-${Date.now()}`,
			created_by: PERSONA_IDS.brandAAdmin!,
			expires_at: new Date(Date.now() + 86_400_000).toISOString()
		})
		.select('id')
		.single();
	expect(error).toBeNull();
	linkId = (data as { id: string }).id;
});

afterAll(async () => {
	await adminClient().from('report_share_links').delete().eq('id', linkId);
});

describe('report_share_links RLS', () => {
	it('the owning org admin can read it', async () => {
		await expectVisible(await personaClient('brandAAdmin'), 'report_share_links', linkId);
	});

	it.each(['brandAMember', 'brandASales', 'brandAGuest'] as const)(
		'%s in the same org cannot',
		async (persona) => {
			await expectHidden(await personaClient(persona), 'report_share_links', linkId);
		}
	);

	it('another org admin cannot', async () => {
		await expectHidden(await personaClient('brandBAdmin'), 'report_share_links', linkId);
	});

	it('anon cannot, so the public page has to go through the token lookup', async () => {
		const { data } = await anonClient().from('report_share_links').select('id').eq('id', linkId);
		expect(data ?? []).toEqual([]);
	});

	it('even the admin cannot insert directly; writes go through the service role', async () => {
		const { error } = await (await personaClient('brandAAdmin')).from('report_share_links').insert({
			organization_id: RLS_IDS.orgBrandA,
			report: 'pipeline',
			title: 'x',
			filter_label: 'x',
			snapshot: { rows: [] },
			token_hash: `rls-direct-${Date.now()}`,
			expires_at: new Date(Date.now() + 86_400_000).toISOString()
		});
		expect(error?.code).toBe('42501');
	});

	it('even the admin cannot revoke or extend directly', async () => {
		await expectUpdateDenied(await personaClient('brandAAdmin'), 'report_share_links', linkId, {
			expires_at: new Date(Date.now() + 10 * 86_400_000).toISOString()
		});
	});
});
