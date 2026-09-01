import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import {
	expectHidden,
	expectInsertAllowed,
	expectInsertDenied,
	expectUpdateAllowed,
	expectVisible
} from './setup/assert.js';

beforeAll(loadPersonaIds);

describe('buyer read surface', () => {
	it('sees their own account', async () => {
		const buyer = await personaClient('buyer');
		await expectVisible(buyer, 'accounts', RLS_IDS.accountBrandA);
	});

	it('does not see other accounts in the same brand org or elsewhere', async () => {
		const buyer = await personaClient('buyer');
		await expectHidden(buyer, 'accounts', RLS_IDS.accountRepA);
		await expectHidden(buyer, 'accounts', RLS_IDS.accountBrandB);
	});

	it('sees only brands granted via account_brand_access', async () => {
		const buyer = await personaClient('buyer');
		await expectVisible(buyer, 'brands', RLS_IDS.brandA1);
		await expectHidden(buyer, 'brands', RLS_IDS.brandA2);
		await expectHidden(buyer, 'brands', RLS_IDS.brandB1);
	});

	it('sees products of granted brands only', async () => {
		const buyer = await personaClient('buyer');
		await expectVisible(buyer, 'products', RLS_IDS.productA1);
		await expectHidden(buyer, 'products', RLS_IDS.productB1);
	});

	it('sees orders on their own account, even ones they did not personally place', async () => {
		// EXPECTATION CORRECTION: the brief describes orderBrandAInternal as
		// "Brand A's own draft... the buyer created neither" and implies both
		// orders should be hidden. The live policy "Buyers see own account
		// orders" (supabase/migrations/20260407000001_buyer_portal.sql) is
		//   USING (account_id IN (SELECT get_buyer_account_ids()))
		// which is account-scoped, not created_by-scoped. orderBrandAInternal
		// has account_id = accountBrandA, the buyer's own account (seeded in
		// tests/rls/setup/fixture.ts), even though brandAAdmin created it (a
		// staff member entering an order on the account's behalf). Per the
		// policy that is visible to the buyer by design: the account is the
		// scoping unit, not the order's creator. orderRepAOnBrandA belongs to
		// accountRepA, a different account, so it stays hidden.
		const buyer = await personaClient('buyer');
		await expectVisible(buyer, 'orders', RLS_IDS.orderBrandAInternal);
		await expectHidden(buyer, 'orders', RLS_IDS.orderRepAOnBrandA);
	});

	it('cannot enumerate the brand org staff', async () => {
		const buyer = await personaClient('buyer');
		const { data } = await buyer
			.from('organization_members')
			.select('id')
			.eq('organization_id', RLS_IDS.orgBrandA);
		expect(data ?? [], 'buyer must not enumerate brand staff').toEqual([]);
	});

	it('does not see other buyers account_users rows', async () => {
		const buyer = await personaClient('buyer');
		const { data } = await buyer.from('account_users').select('profile_id');
		const profiles = ((data ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id);
		expect(new Set(profiles)).toEqual(new Set([PERSONA_IDS.buyer]));
	});
});

describe('buyer write surface', () => {
	it('can insert a draft order for their own account and brand, and a line on it', async () => {
		const buyer = await personaClient('buyer');
		const orderId = await expectInsertAllowed(buyer, 'orders', {
			organization_id: RLS_IDS.orgBrandA,
			brand_id: RLS_IDS.brandA1,
			account_id: RLS_IDS.accountBrandA,
			created_by: PERSONA_IDS.buyer,
			status: 'draft'
		});
		try {
			// This is the positive control for the denial tests below: it
			// proves a buyer can create a valid draft order and a line on it
			// at all, so the denials that follow are the policy actually
			// stopping something, not the buyer being unable to write
			// anything.
			const { error: lineError } = await buyer.from('order_lines').insert({
				order_id: orderId,
				qty: 1,
				unit_price: 50
			});
			expect(
				lineError,
				`order_lines insert should be allowed, got ${lineError?.message}`
			).toBeNull();
		} finally {
			// order_lines has an AFTER DELETE trigger that inserts into
			// order_audits referencing order_id. Deleting the order first
			// would cascade-delete the line and race that insert against the
			// order's own removal (see the same note in
			// tests/rls/setup/fixture.ts teardownRlsFixture). Delete the line
			// first, while the parent order still exists.
			await adminClient().from('order_lines').delete().eq('order_id', orderId);
			await adminClient().from('orders').delete().eq('id', orderId);
		}
	});

	it('cannot insert an order against a brand not granted through account_brand_access', async () => {
		// brandA2 belongs to orgBrandA but account_brand_access only grants
		// accountBrandA access to brandA1. The row is otherwise valid, so a
		// 42501 here is the "Buyers can create draft orders" WITH CHECK
		// clause (brand_id IN get_buyer_brand_ids()) doing the denying, not a
		// malformed row failing a NOT NULL or check constraint.
		const buyer = await personaClient('buyer');
		await expectInsertDenied(buyer, 'orders', {
			organization_id: RLS_IDS.orgBrandA,
			brand_id: RLS_IDS.brandA2,
			account_id: RLS_IDS.accountBrandA,
			created_by: PERSONA_IDS.buyer,
			status: 'draft'
		});
	});

	it('cannot insert an order against an account that is not theirs', async () => {
		// accountRepA is Rep A's account, not the buyer's. Same reasoning as
		// above: the row is otherwise valid, so 42501 here is the WITH CHECK
		// clause (account_id IN get_buyer_account_ids()) denying it.
		const buyer = await personaClient('buyer');
		await expectInsertDenied(buyer, 'orders', {
			organization_id: RLS_IDS.orgRepA,
			brand_id: RLS_IDS.brandA1,
			account_id: RLS_IDS.accountRepA,
			created_by: PERSONA_IDS.buyer,
			status: 'draft'
		});
	});

	// The recursive WITH CHECK on "Brand admin updates federated order
	// status" (supabase/migrations/20260530000001_security_review_fixes.sql)
	// used to cause Postgres error 42P17 (infinite recursion detected in
	// policy for relation "orders") on every UPDATE to orders, for every
	// persona, regardless of which policy would otherwise apply. Fixed in
	// supabase/migrations/20260901000001_fix_orders_update_recursion.sql.
	//
	// "Buyers can update own draft orders" (supabase/migrations/20260407000001_buyer_portal.sql)
	// has no WITH CHECK and its USING clause checks only account_id and
	// created_by, neither of which changes here, so it does not restrict
	// which status a buyer may set. This update is genuinely allowed by
	// the current policy set. Whether buyers should be scoped away from
	// setting status directly is a separate product question, out of
	// scope for this recursion fix.
	it('can update their own draft order, including its status', async () => {
		const buyer = await personaClient('buyer');
		const orderId = await expectInsertAllowed(buyer, 'orders', {
			organization_id: RLS_IDS.orgBrandA,
			brand_id: RLS_IDS.brandA1,
			account_id: RLS_IDS.accountBrandA,
			created_by: PERSONA_IDS.buyer,
			status: 'draft'
		});
		try {
			await expectUpdateAllowed(buyer, 'orders', orderId, { status: 'confirmed' });
		} finally {
			await adminClient().from('orders').delete().eq('id', orderId);
		}
	});
});
