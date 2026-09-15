import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS, RLS_ORG_IDS } from './setup/ids.js';
import {
	MEMBER_ROW_IDS,
	PERSONA_EMAILS,
	PERSONA_IDS,
	loadPersonaIds,
	personaClient,
	type RlsPersona
} from './setup/fixture.js';

beforeAll(loadPersonaIds);

describe('rls fixture', () => {
	it('seeded all four orgs', async () => {
		const { data } = await adminClient().from('organizations').select('id').in('id', RLS_ORG_IDS);
		expect((data ?? []).length).toBe(4);
	});

	it('seeded the connection pair with the intended statuses', async () => {
		const { data } = await adminClient()
			.from('org_connections')
			.select('id, status')
			.in('id', [RLS_IDS.connActive, RLS_IDS.connPending]);
		const byId = new Map(
			((data ?? []) as Array<{ id: string; status: string }>).map((r) => [r.id, r.status])
		);
		expect(byId.get(RLS_IDS.connActive)).toBe('active');
		expect(byId.get(RLS_IDS.connPending)).toBe('pending');
	});

	it('every persona can sign in', async () => {
		for (const persona of Object.keys(PERSONA_EMAILS) as RlsPersona[]) {
			const client = await personaClient(persona);
			const { data } = await client.auth.getUser();
			expect(data.user?.email, `${persona} session`).toBe(PERSONA_EMAILS[persona]);
		}
	});

	it('loadPersonaIds populates both id maps', () => {
		expect(PERSONA_IDS.repAAdmin).toBeTruthy();
		expect(PERSONA_IDS.buyer).toBeTruthy();
		expect(MEMBER_ROW_IDS.brandAMember).toBeTruthy();
		// The buyer has no organization_members row by design.
		expect(MEMBER_ROW_IDS.buyer).toBeUndefined();
	});
});
