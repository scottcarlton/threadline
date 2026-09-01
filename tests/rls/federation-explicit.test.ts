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

describe('federated order write boundaries', () => {
	// SECURITY/CORRECTNESS FINDING: the live policy "Brand admin updates
	// federated order status" (supabase/migrations/20260530000001_security_review_fixes.sql)
	// has:
	//   WITH CHECK (
	//     organization_id = (SELECT organization_id FROM orders o2 WHERE o2.id = orders.id)
	//   )
	// That WITH CHECK subquery selects from `orders` itself, which is
	// RLS-enabled. Postgres must re-apply orders' own RLS policies to plan
	// that subquery, which requires re-evaluating this same UPDATE policy's
	// WITH CHECK, which selects from orders again -- infinite recursion.
	// Postgres detects the cycle and raises 42P17 ("infinite recursion
	// detected in policy for relation \"orders\"") instead of looping
	// forever.
	//
	// This is not scoped to federated brand updates: it breaks EVERY
	// UPDATE to the orders table, for every persona, including a rep
	// updating their own order. Confirmed independently outside this test
	// file with a raw SQL session (`set local role authenticated; update
	// orders set notes = '...' where id = ...`) using no persona at all --
	// same 42P17. So the bug is structural, not row- or actor-specific.
	//
	// Net effect: today, no order in this schema can ever have its status
	// (or anything else) updated once RLS is in force. The brand cannot do
	// what §A.3 says it should be able to do (advance a federated order's
	// status), and no client, own-org or federated, can update orders at
	// all. This is a functional break, not a narrower-than-expected grant,
	// so it is marked failing rather than the expectation being weakened.
	it.fails(
		'the target brand can advance the order status (BLOCKED: every orders UPDATE hits 42P17 infinite recursion, see comment above)',
		async () => {
			const brandA = await personaClient('brandAAdmin');
			try {
				const { data, error } = await brandA
					.from('orders')
					.update({ status: 'confirmed' })
					.eq('id', RLS_IDS.orderRepAOnBrandA)
					.select('id');
				expect(error).toBeNull();
				expect(data ?? []).toEqual([{ id: RLS_IDS.orderRepAOnBrandA }]);
			} finally {
				await adminClient()
					.from('orders')
					.update({ status: 'submitted' })
					.eq('id', RLS_IDS.orderRepAOnBrandA);
			}
		}
	);

	// While the recursion bug above is live, EVERY update to orders fails
	// for every role, so "an unrelated org cannot update this order" is
	// currently guaranteed by the bug itself, not by any policy -- this
	// test provides no security signal right now, no matter which error
	// code it accepts.
	//
	// This is written as a plain `it`, not `it.fails`, characterizing the
	// CURRENT behavior: the update fails with 42P17. That is a truthful
	// statement about today, not an endorsement. When the recursion is
	// fixed this test will fail loudly in both directions: if the fix
	// correctly denies the update, this assertion (expecting 42P17) breaks
	// and must be replaced; if the fix is wrong and allows the update
	// through, this assertion also breaks. Either way it cannot stay green
	// silently. The correct denial assertion (42501, zero rows affected)
	// must be reinstated as part of that fix PR.
	it('an unrelated org cannot touch the order (currently: every orders UPDATE hits 42P17 recursion)', async () => {
		const repB = await personaClient('repBAdmin');
		const { data, error } = await repB
			.from('orders')
			.update({ status: 'cancelled' })
			.eq('id', RLS_IDS.orderRepAOnBrandA)
			.select('id');
		expect(data).toBeNull();
		expect(error?.code).toBe('42P17');
	});

	it('federated link rows cannot be forged by a client', async () => {
		const repB = await personaClient('repBAdmin');
		const { error } = await repB.from('federated_order_links').insert({
			order_id: RLS_IDS.orderBrandAInternal,
			connection_id: RLS_IDS.connPending,
			source_org_id: RLS_IDS.orgBrandA,
			target_org_id: RLS_IDS.orgRepB,
			status: 'active'
		});
		expect(error?.code, 'link forgery must be denied').toBe('42501');
	});
});
