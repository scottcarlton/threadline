import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, personaClient } from './setup/fixture.js';
import {
	expectHidden,
	expectUpdateAllowed,
	expectUpdateDenied,
	expectVisible
} from './setup/assert.js';

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
	// The live policy "Brand admin updates federated order status"
	// (supabase/migrations/20260530000001_security_review_fixes.sql) used
	// to carry a WITH CHECK that subqueried orders from inside an orders
	// policy, causing unconditional infinite recursion (42P17) on every
	// UPDATE to orders, for every persona. Fixed in
	// supabase/migrations/20260901000001_fix_orders_update_recursion.sql
	// by dropping the recursive WITH CHECK: for an UPDATE policy with none,
	// Postgres reuses the USING expression, which references only
	// federated_order_links and organization_members, never orders itself.
	// Positive control for the own-org UPDATE path
	// ("Admin/owner/member/sales can update orders"): this is the
	// highest-traffic policy the recursion broke (bulk status update, order
	// detail page), but the federated and buyer cases above and below don't
	// exercise it.
	it('an own-org admin can update their own order', async () => {
		const repA = await personaClient('repAAdmin');
		try {
			await expectUpdateAllowed(repA, 'orders', RLS_IDS.orderRepAOnBrandA, {
				notes: 'updated by own-org admin'
			});
		} finally {
			await adminClient()
				.from('orders')
				.update({ notes: null })
				.eq('id', RLS_IDS.orderRepAOnBrandA);
		}
	});

	it('the target brand can advance the order status', async () => {
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
	});

	it('an unrelated org cannot touch the order', async () => {
		const repB = await personaClient('repBAdmin');
		await expectUpdateDenied(repB, 'orders', RLS_IDS.orderRepAOnBrandA, { status: 'cancelled' });
	});

	// The recursive WITH CHECK on "Brand admin updates federated order
	// status" was trying to stop a federated brand admin from reassigning
	// an order to a different organization. It was replaced by a
	// BEFORE UPDATE OF organization_id trigger
	// (public.reject_orders_organization_id_change, see
	// supabase/migrations/20260901000001_fix_orders_update_recursion.sql),
	// which is strictly stronger: it also covers service-role writes,
	// which bypass RLS entirely and which the WITH CHECK never protected.
	it('organization_id cannot be reassigned, even by an own-org admin', async () => {
		const brandA = await personaClient('brandAAdmin');
		const { error } = await brandA
			.from('orders')
			.update({ organization_id: RLS_IDS.orgRepB })
			.eq('id', RLS_IDS.orderBrandAInternal)
			.select('id');
		expect(
			error,
			'organization_id reassignment should be rejected by the immutability trigger'
		).not.toBeNull();
		expect(error?.message).toMatch(/organization_id is immutable/);
	});

	// The stated reason for a trigger over a WITH CHECK is that it also
	// fires for service-role writes, which RLS never covers -- the test
	// above only proves it fires for an RLS subject. Postgres runs BEFORE
	// ROW triggers before evaluating RLS WITH CHECK, so the service role,
	// which bypasses RLS entirely, still hits this trigger.
	it('organization_id cannot be reassigned even by the service role', async () => {
		const { error } = await adminClient()
			.from('orders')
			.update({ organization_id: RLS_IDS.orgRepB })
			.eq('id', RLS_IDS.orderBrandAInternal)
			.select('id');
		expect(
			error,
			'organization_id reassignment should be rejected by the immutability trigger even for the service role'
		).not.toBeNull();
		expect(error?.message).toMatch(/organization_id is immutable/);
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
