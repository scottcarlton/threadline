import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, personaClient } from './setup/fixture.js';
import { expectHidden, expectVisible } from './setup/assert.js';

beforeAll(loadPersonaIds);

describe('auto_federate_order trigger', () => {
	it('creates an order link for an order against a connected brand', async () => {
		const { data } = await adminClient()
			.from('federated_order_links')
			.select('order_id, source_org_id, target_org_id, status')
			.eq('order_id', RLS_IDS.orderRepAOnBrandA);
		expect(data ?? []).toHaveLength(1);
		expect((data ?? [])[0]).toMatchObject({
			source_org_id: RLS_IDS.orgRepA,
			target_org_id: RLS_IDS.orgBrandA,
			status: 'active'
		});
	});

	it('creates an account link so the brand can see the ordering account', async () => {
		const { data } = await adminClient()
			.from('federated_account_links')
			.select('account_id, target_org_id')
			.eq('account_id', RLS_IDS.accountRepA);
		expect(data ?? []).toHaveLength(1);
		expect((data ?? [])[0]).toMatchObject({ target_org_id: RLS_IDS.orgBrandA });
	});

	it('creates no link for an order with no active connection', async () => {
		// orderRepBOnBrandB is Rep B against Brand B, with no connection at all.
		const { data } = await adminClient()
			.from('federated_order_links')
			.select('order_id')
			.eq('order_id', RLS_IDS.orderRepBOnBrandB);
		expect(data ?? []).toEqual([]);
	});
});

describe('orders and order_lines RLS', () => {
	it('the ordering rep sees its own order', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'orders', RLS_IDS.orderRepAOnBrandA);
		await expectVisible(repA, 'order_lines', RLS_IDS.orderLineRepAOnBrandA);
	});

	it('the target brand sees the federated order and its lines', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'orders', RLS_IDS.orderRepAOnBrandA);
		await expectVisible(brandA, 'order_lines', RLS_IDS.orderLineRepAOnBrandA);
	});

	it('an unrelated org sees neither', async () => {
		const repB = await personaClient('repBAdmin');
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(repB, 'orders', RLS_IDS.orderRepAOnBrandA);
		await expectHidden(repB, 'order_lines', RLS_IDS.orderLineRepAOnBrandA);
		await expectHidden(brandB, 'orders', RLS_IDS.orderRepAOnBrandA);
	});

	it('a connected rep does not see the brand internal orders', async () => {
		// orderBrandAInternal belongs to Brand A and has no federation link.
		const repA = await personaClient('repAAdmin');
		await expectHidden(repA, 'orders', RLS_IDS.orderBrandAInternal);
	});

	it('federated link rows are visible only to the two involved orgs', async () => {
		const repA = await personaClient('repAAdmin');
		const brandA = await personaClient('brandAAdmin');
		const repB = await personaClient('repBAdmin');

		for (const [label, client, expected] of [
			['rep A', repA, 1],
			['brand A', brandA, 1],
			['rep B', repB, 0]
		] as const) {
			const { data } = await client
				.from('federated_order_links')
				.select('order_id')
				.eq('order_id', RLS_IDS.orderRepAOnBrandA);
			expect(data ?? [], `${label} view of the link`).toHaveLength(expected);
		}
	});
});
