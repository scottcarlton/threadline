import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { MEMBER_ROW_IDS, PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import { expectHidden, expectVisible } from './setup/assert.js';

/**
 * One probe row per own-org table, owned by RLS Rep A. Each probe is
 * inserted with the service-role client, checked, and deleted, so this spec
 * owns its own data and never disturbs the shared fixture.
 *
 * Every table here comes from the "Own-org tables (no federation SELECT)"
 * section of docs/brd/permissions-implementation-map.md A.3.
 */
type Probe = {
	table: string;
	row: () => Record<string, unknown>;
};

let probes: Probe[];

beforeAll(async () => {
	await loadPersonaIds();
	probes = [
		{
			table: 'seasons',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Season' })
		},
		{
			table: 'shows',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Show' })
		},
		{
			table: 'source_types',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Source' })
		},
		{
			table: 'territories',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Territory' })
		},
		{
			table: 'appointments',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				notes: 'RLS Probe Appointment',
				created_by: PERSONA_IDS.repAAdmin
			})
		},
		{
			table: 'commission_overrides',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				brand_id: RLS_IDS.brandRepAOwn,
				account_id: RLS_IDS.accountRepA,
				rate: 5
			})
		},
		{
			table: 'organization_sales_tax_rates',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				rate: 8.875,
				state_code: 'NY',
				tax_type: 'destination'
			})
		},
		{
			table: 'organization_shipping_methods',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				name: 'RLS Probe Shipping',
				cost_type: 'flat'
			})
		},
		{
			table: 'discovered_contacts',
			row: () => ({ organization_id: RLS_IDS.orgRepA, email: 'probe@rls-test.threadline.local' })
		},
		{
			table: 'integration_connections',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				provider: 'notion',
				access_token: 'rls-probe-token',
				connected_by: PERSONA_IDS.repAAdmin
			})
		},
		{
			table: 'org_agents',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				name: 'RLS Probe Agent',
				slug: 'rls-probe-agent',
				system_prompt: 'RLS probe system prompt',
				created_by: PERSONA_IDS.repAAdmin
			})
		},
		{
			table: 'email_log',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				subject: 'RLS Probe Email',
				sent_by: PERSONA_IDS.repAAdmin,
				to_email: 'probe@rls-test.threadline.local'
			})
		},
		{
			table: 'insight_actions',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				title: 'RLS Probe Insight',
				insight_type: 'rls_probe'
			})
		},
		{
			table: 'member_brand_commissions',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				member_id: MEMBER_ROW_IDS.repAAdmin,
				brand_id: RLS_IDS.brandRepAOwn,
				rate: 10
			})
		}
	];
});

/**
 * If an insert fails with 42703 (undefined column) or 23502 (not-null
 * violation), the probe columns are wrong. Read the real columns with:
 *   docker exec supabase_db_threadline psql -U postgres -d postgres -c "\d <table>"
 * and correct the probe. Do not delete the probe to make the suite green.
 */
async function insertProbe(probe: Probe): Promise<string> {
	const { data, error } = await adminClient()
		.from(probe.table)
		.insert(probe.row())
		.select('id')
		.single();
	if (error) {
		throw new Error(
			`probe insert for ${probe.table} failed: ${error.code} ${error.message}. ` +
				'Correct the probe columns against the real schema.'
		);
	}
	return (data as { id: string }).id;
}

describe('own-org isolation', () => {
	it('an outsider org admin sees none of another org rows', async () => {
		const outsider = await personaClient('repBAdmin');
		const owner = await personaClient('repAAdmin');
		for (const probe of probes) {
			const id = await insertProbe(probe);
			try {
				await expectVisible(owner, probe.table, id);
				await expectHidden(outsider, probe.table, id);
			} finally {
				await adminClient().from(probe.table).delete().eq('id', id);
			}
		}
	});

	it('anon sees none of another org rows', async () => {
		const anon = anonClient();
		for (const probe of probes) {
			const id = await insertProbe(probe);
			try {
				await expectHidden(anon, probe.table, id);
			} finally {
				await adminClient().from(probe.table).delete().eq('id', id);
			}
		}
	});

	it('organizations, members, and profiles respect org boundaries', async () => {
		const repA = await personaClient('repAAdmin');
		const repB = await personaClient('repBAdmin');

		await expectVisible(repA, 'organizations', RLS_IDS.orgRepA);
		await expectHidden(repA, 'organizations', RLS_IDS.orgRepB);
		await expectHidden(repB, 'organizations', RLS_IDS.orgRepA);

		const { data: repAMembers } = await repA.from('organization_members').select('organization_id');
		const orgs = new Set(
			((repAMembers ?? []) as Array<{ organization_id: string }>).map((r) => r.organization_id)
		);
		expect(orgs.has(RLS_IDS.orgRepB)).toBe(false);

		// profiles: own row plus org peers only.
		const { data: visibleProfiles } = await repA
			.from('profiles')
			.select('id')
			.in('id', [PERSONA_IDS.repASales!, PERSONA_IDS.repBAdmin!]);
		const seen = ((visibleProfiles ?? []) as Array<{ id: string }>).map((r) => r.id);
		expect(seen).toContain(PERSONA_IDS.repASales);
		expect(seen).not.toContain(PERSONA_IDS.repBAdmin);
	});

	it('per-user tables are scoped to auth.uid()', async () => {
		const repA = await personaClient('repAAdmin');
		const repB = await personaClient('repBAdmin');

		const { data: cart, error: cartErr } = await adminClient()
			.from('cart_items')
			.insert({
				profile_id: PERSONA_IDS.repAAdmin!,
				product_id: RLS_IDS.productA1
			})
			.select('id')
			.single();
		expect(cartErr).toBeNull();
		const cartId = (cart as { id: string }).id;

		try {
			await expectVisible(repA, 'cart_items', cartId);
			await expectHidden(repB, 'cart_items', cartId);
		} finally {
			await adminClient().from('cart_items').delete().eq('id', cartId);
		}
	});
});
