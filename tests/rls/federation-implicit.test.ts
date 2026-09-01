import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, personaClient, PERSONA_IDS } from './setup/fixture.js';
import { expectHidden, expectVisible } from './setup/assert.js';
import { adminClient } from './setup/clients.js';

beforeAll(loadPersonaIds);

describe('implicit federation via get_connected_org_ids', () => {
	it('a connected rep sees the brand org brands', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'brands', RLS_IDS.brandA1);
		await expectVisible(repA, 'brands', RLS_IDS.brandA2);
	});

	it('a connected rep sees the brand org products and variants', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'products', RLS_IDS.productA1);
		await expectVisible(repA, 'product_variants', RLS_IDS.variantA1);
	});

	it('an unconnected brand org is invisible to the rep', async () => {
		const repA = await personaClient('repAAdmin');
		await expectHidden(repA, 'brands', RLS_IDS.brandB1);
		await expectHidden(repA, 'products', RLS_IDS.productB1);
	});

	it('a pending connection grants nothing', async () => {
		// Rep B has a connection row to Brand A with status pending.
		const repB = await personaClient('repBAdmin');
		await expectHidden(repB, 'brands', RLS_IDS.brandA1);
		await expectHidden(repB, 'products', RLS_IDS.productA1);
	});

	it('an org with no connections sees nothing', async () => {
		// Brand B has zero connection rows in the fixture, so
		// get_connected_org_ids() for brandBAdmin returns empty regardless of
		// what Rep A or Brand A can see. This does not exercise transitivity
		// (see the dedicated transitivity test below); it only proves an org
		// with no connections at all sees nothing through federation.
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(brandB, 'brands', RLS_IDS.brandRepAOwn);
		await expectHidden(brandB, 'accounts', RLS_IDS.accountRepA);
	});

	it('federation does not chain through a rep shared by two brand orgs', async () => {
		// The only transitive path this schema could leak through: Rep A is
		// actively connected to Brand A. If Rep A ALSO connects to Brand B
		// (a showroom repping two competing brands), Brand A and Brand B must
		// not gain visibility into each other's brands/products through their
		// shared rep. org_connections only ever links a rep org to a brand
		// org directly -- there is no brand-to-brand edge -- so this must
		// resolve to nothing in both directions.
		const admin = adminClient();
		const tempConnId = '0f500000-0000-4000-8000-000000009901';
		const { error: connErr } = await admin.from('org_connections').insert({
			id: tempConnId,
			rep_org_id: RLS_IDS.orgRepA,
			brand_org_id: RLS_IDS.orgBrandB,
			status: 'active',
			commission_rate: 12,
			connected_at: new Date().toISOString(),
			requested_by: PERSONA_IDS.repAAdmin!,
			approved_by: PERSONA_IDS.brandBAdmin!
		});
		expect(connErr).toBeNull();

		try {
			const repA = await personaClient('repAAdmin');

			// Positive control: prove the new connection actually took effect.
			// personaClient caches sessions, but RLS is evaluated per query, not
			// per session, so the already-cached repA client picks up the new
			// connection without re-authenticating.
			await expectVisible(repA, 'brands', RLS_IDS.brandB1);
			await expectVisible(repA, 'products', RLS_IDS.productB1);

			// The actual transitivity assertion: Brand A and Brand B must not
			// see each other through the rep they now both connect to.
			const brandA = await personaClient('brandAAdmin');
			const brandB = await personaClient('brandBAdmin');
			await expectHidden(brandA, 'brands', RLS_IDS.brandB1);
			await expectHidden(brandA, 'products', RLS_IDS.productB1);
			await expectHidden(brandB, 'brands', RLS_IDS.brandA1);
			await expectHidden(brandB, 'products', RLS_IDS.productA1);
		} finally {
			await admin.from('org_connections').delete().eq('id', tempConnId);
		}
	});

	it('a connected rep cannot write the brand org products', async () => {
		const repA = await personaClient('repAAdmin');
		const { data, error } = await repA
			.from('products')
			.update({ name: 'hijacked' })
			.eq('id', RLS_IDS.productA1)
			.select('id');
		if (error) {
			expect(error.code).toBe('42501');
		} else {
			expect(data ?? []).toEqual([]);
		}
	});
});

describe('accounts federation asymmetry', () => {
	it('a connected rep sees the brand org accounts (implicit direction)', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'accounts', RLS_IDS.accountBrandA);
	});

	it('a connected brand does NOT see the rep account book wholesale', async () => {
		// accountRepA IS federated, because the fixture order references it.
		// Prove the mechanism is the explicit link rather than blanket
		// connection access by adding a rep-owned account with no order.
		const admin = adminClient();
		const { data, error } = await admin
			.from('accounts')
			.insert({
				organization_id: RLS_IDS.orgRepA,
				business_name: 'RLS Unfederated Rep Account'
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		const unfederatedId = (data as { id: string }).id;

		try {
			const brandA = await personaClient('brandAAdmin');
			await expectHidden(brandA, 'accounts', unfederatedId);
		} finally {
			await admin.from('accounts').delete().eq('id', unfederatedId);
		}
	});

	it('a connected brand sees a rep account that an order federated', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'accounts', RLS_IDS.accountRepA);
	});

	it('account satellites follow the same asymmetry', async () => {
		const admin = adminClient();
		const { data, error } = await admin
			.from('account_locations')
			.insert({
				account_id: RLS_IDS.accountBrandA,
				organization_id: RLS_IDS.orgBrandA,
				label: 'RLS Probe Location'
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		const locationId = (data as { id: string }).id;

		try {
			const repA = await personaClient('repAAdmin');
			const repB = await personaClient('repBAdmin');
			await expectVisible(repA, 'account_locations', locationId);
			await expectHidden(repB, 'account_locations', locationId);
		} finally {
			await admin.from('account_locations').delete().eq('id', locationId);
		}
	});
});

describe('account_brand_access and account_users have no federation SELECT policy', () => {
	// §A.4 says these two tables carry no federation SELECT policy at all:
	// visibility is limited to members of the owning org (plus the buyer
	// themselves for account_users). A connected rep or an unconnected brand
	// seeing either row would mean a federation policy exists where the
	// permissions map says it should not.
	let brandAccessId: string;
	let accountUserId: string;

	beforeAll(async () => {
		const admin = adminClient();

		const { data: accessRow, error: accessErr } = await admin
			.from('account_brand_access')
			.select('id')
			.eq('account_id', RLS_IDS.accountBrandA)
			.eq('brand_id', RLS_IDS.brandA1)
			.single();
		if (accessErr || !accessRow) {
			throw new Error(`account_brand_access lookup failed: ${accessErr?.message}`);
		}
		brandAccessId = (accessRow as { id: string }).id;

		const { data: userRow, error: userErr } = await admin
			.from('account_users')
			.select('id')
			.eq('account_id', RLS_IDS.accountBrandA)
			.eq('profile_id', PERSONA_IDS.buyer!)
			.single();
		if (userErr || !userRow) {
			throw new Error(`account_users lookup failed: ${userErr?.message}`);
		}
		accountUserId = (userRow as { id: string }).id;
	});

	it('account_brand_access is visible to members of the owning org', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'account_brand_access', brandAccessId);
	});

	it('account_brand_access is hidden from a connected rep', async () => {
		const repA = await personaClient('repAAdmin');
		await expectHidden(repA, 'account_brand_access', brandAccessId);
	});

	it('account_brand_access is hidden from an unconnected rep and brand', async () => {
		const repB = await personaClient('repBAdmin');
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(repB, 'account_brand_access', brandAccessId);
		await expectHidden(brandB, 'account_brand_access', brandAccessId);
	});

	it('account_users is visible to members of the owning org', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'account_users', accountUserId);
	});

	it('account_users is hidden from a connected rep and an unconnected brand', async () => {
		const repA = await personaClient('repAAdmin');
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(repA, 'account_users', accountUserId);
		await expectHidden(brandB, 'account_users', accountUserId);
	});
});

describe('brand_expenses and expense_receipts federation', () => {
	// The "Expenses visible via federation" policy
	// (supabase/migrations/20260417000001_federation_rls.sql) is scoped to
	// brand ownership, not connection status:
	//   USING (
	//     brand_id IN (SELECT b.id FROM brands b WHERE b.organization_id IN (SELECT get_user_org_ids()))
	//     AND organization_id NOT IN (SELECT get_user_org_ids())
	//   )
	// It grants a brand org visibility into a brand_expenses row tagged to
	// one of its own brand_ids even when that row's organization_id belongs
	// to a different (submitting) org. It does NOT grant a connected rep
	// visibility into the brand org's own-submitted expenses on brands the
	// rep does not own. That is the opposite direction from what the task
	// 4.3 brief assumed ("visible to repAAdmin (connected)" for a brand A1
	// expense submitted by brandAAdmin) -- that assumption is corrected
	// here. The scenario the federation policy actually covers is a rep
	// charging an expense to a connected brand's brand_id, which the brand
	// then needs to see to review it. That scenario is exercised below as
	// federatedFromRepExpenseId.
	let repOwnExpenseId: string;
	let repOwnReceiptId: string;
	let brandA1OwnExpenseId: string;
	let brandA2ExpenseId: string;
	let federatedFromRepExpenseId: string;
	let federatedFromRepReceiptId: string;

	beforeAll(async () => {
		const admin = adminClient();

		const { data: brandA1OwnExpense, error: brandA1Err } = await admin
			.from('brand_expenses')
			.insert({
				organization_id: RLS_IDS.orgBrandA,
				brand_id: RLS_IDS.brandA1,
				description: 'RLS probe brand A1 own expense',
				amount: 20,
				submitted_by: PERSONA_IDS.brandAAdmin!
			})
			.select('id')
			.single();
		if (brandA1Err || !brandA1OwnExpense) {
			throw new Error(`brand_expenses (brand A1 own) insert failed: ${brandA1Err?.message}`);
		}
		brandA1OwnExpenseId = (brandA1OwnExpense as { id: string }).id;

		const { data: brandA2Expense, error: brandA2Err } = await admin
			.from('brand_expenses')
			.insert({
				organization_id: RLS_IDS.orgBrandA,
				brand_id: RLS_IDS.brandA2,
				description: 'RLS probe brand A2 expense',
				amount: 30,
				submitted_by: PERSONA_IDS.brandAAdmin!
			})
			.select('id')
			.single();
		if (brandA2Err || !brandA2Expense) {
			throw new Error(`brand_expenses (brand A2) insert failed: ${brandA2Err?.message}`);
		}
		brandA2ExpenseId = (brandA2Expense as { id: string }).id;

		const { data: repOwnExpense, error: repOwnErr } = await admin
			.from('brand_expenses')
			.insert({
				organization_id: RLS_IDS.orgRepA,
				brand_id: RLS_IDS.brandRepAOwn,
				description: 'RLS probe rep-own expense',
				amount: 10,
				submitted_by: PERSONA_IDS.repAAdmin!
			})
			.select('id')
			.single();
		if (repOwnErr || !repOwnExpense) {
			throw new Error(`brand_expenses (rep own) insert failed: ${repOwnErr?.message}`);
		}
		repOwnExpenseId = (repOwnExpense as { id: string }).id;

		const { data: repOwnReceipt, error: repOwnReceiptErr } = await admin
			.from('expense_receipts')
			.insert({
				expense_id: repOwnExpenseId,
				organization_id: RLS_IDS.orgRepA,
				name: 'RLS probe rep-own receipt',
				file_path: 'rls-probe/rep-own-receipt.pdf'
			})
			.select('id')
			.single();
		if (repOwnReceiptErr || !repOwnReceipt) {
			throw new Error(`expense_receipts (rep own) insert failed: ${repOwnReceiptErr?.message}`);
		}
		repOwnReceiptId = (repOwnReceipt as { id: string }).id;

		// Rep A charges an expense to the connected Brand A's own brand_id.
		// organization_id stays Rep A's own org (the submitter); brand_id
		// points at Brand A's brand. This is the row shape the federation
		// SELECT policy is written for.
		const { data: federatedExpense, error: federatedErr } = await admin
			.from('brand_expenses')
			.insert({
				organization_id: RLS_IDS.orgRepA,
				brand_id: RLS_IDS.brandA1,
				description: 'RLS probe rep-submitted expense on brand A1',
				amount: 15,
				submitted_by: PERSONA_IDS.repAAdmin!
			})
			.select('id')
			.single();
		if (federatedErr || !federatedExpense) {
			throw new Error(
				`brand_expenses (federated from rep) insert failed: ${federatedErr?.message}`
			);
		}
		federatedFromRepExpenseId = (federatedExpense as { id: string }).id;

		const { data: federatedReceipt, error: federatedReceiptErr } = await admin
			.from('expense_receipts')
			.insert({
				expense_id: federatedFromRepExpenseId,
				organization_id: RLS_IDS.orgRepA,
				name: 'RLS probe rep-submitted receipt on brand A1',
				file_path: 'rls-probe/federated-from-rep-receipt.pdf'
			})
			.select('id')
			.single();
		if (federatedReceiptErr || !federatedReceipt) {
			throw new Error(
				`expense_receipts (federated from rep) insert failed: ${federatedReceiptErr?.message}`
			);
		}
		federatedFromRepReceiptId = (federatedReceipt as { id: string }).id;
	});

	afterAll(async () => {
		const admin = adminClient();
		await admin
			.from('brand_expenses')
			.delete()
			.in('id', [
				repOwnExpenseId,
				brandA1OwnExpenseId,
				brandA2ExpenseId,
				federatedFromRepExpenseId
			]);
		// expense_receipts cascade-deletes with their parent expense, but
		// delete explicitly in case an assertion above never ran.
		await admin
			.from('expense_receipts')
			.delete()
			.in('id', [repOwnReceiptId, federatedFromRepReceiptId]);
	});

	it('a rep-own brand expense is visible to the rep and hidden from unconnected orgs', async () => {
		const repA = await personaClient('repAAdmin');
		const repB = await personaClient('repBAdmin');
		const brandB = await personaClient('brandBAdmin');
		await expectVisible(repA, 'brand_expenses', repOwnExpenseId);
		await expectHidden(repB, 'brand_expenses', repOwnExpenseId);
		await expectHidden(brandB, 'brand_expenses', repOwnExpenseId);
	});

	it('a brand A1 own-submitted expense is visible only to the owning brand, not the connected rep', async () => {
		// Corrected from the task 4.3 brief: the federation SELECT policy on
		// brand_expenses grants the brand org visibility into rows tagged to
		// its own brand_id from OTHER orgs, not the reverse. A connected rep
		// gets no grant to see the brand org's own-submitted expenses.
		const brandA = await personaClient('brandAAdmin');
		const repA = await personaClient('repAAdmin');
		const repB = await personaClient('repBAdmin');
		await expectVisible(brandA, 'brand_expenses', brandA1OwnExpenseId);
		await expectHidden(repA, 'brand_expenses', brandA1OwnExpenseId);
		await expectHidden(repB, 'brand_expenses', brandA1OwnExpenseId);
	});

	it('a rep-submitted expense on the connected brand is visible to the brand, hidden from the unconnected rep and brand', async () => {
		const brandA = await personaClient('brandAAdmin');
		const repB = await personaClient('repBAdmin');
		const brandB = await personaClient('brandBAdmin');
		await expectVisible(brandA, 'brand_expenses', federatedFromRepExpenseId);
		await expectHidden(repB, 'brand_expenses', federatedFromRepExpenseId);
		await expectHidden(brandB, 'brand_expenses', federatedFromRepExpenseId);
	});

	it('expense_receipts inherit the visibility of their parent expense', async () => {
		const repA = await personaClient('repAAdmin');
		const repB = await personaClient('repBAdmin');
		const brandB = await personaClient('brandBAdmin');
		const brandA = await personaClient('brandAAdmin');

		await expectVisible(repA, 'expense_receipts', repOwnReceiptId);
		await expectHidden(repB, 'expense_receipts', repOwnReceiptId);
		await expectHidden(brandB, 'expense_receipts', repOwnReceiptId);

		await expectVisible(brandA, 'expense_receipts', federatedFromRepReceiptId);
		await expectHidden(repB, 'expense_receipts', federatedFromRepReceiptId);
		await expectHidden(brandB, 'expense_receipts', federatedFromRepReceiptId);
	});

	it('a member scoped to brand A1 sees the A1 expense and not the A2 expense', async () => {
		const brandAMember = await personaClient('brandAMember');
		await expectVisible(brandAMember, 'brand_expenses', brandA1OwnExpenseId);
		await expectHidden(brandAMember, 'brand_expenses', brandA2ExpenseId);
	});

	// Positive control for the test above: an unscoped admin in the same org
	// sees the A2 expense the scoped member is hidden from, proving the
	// hidden result above is member_brand_access scoping and not some
	// unrelated reason the row is invisible to everyone.
	it('an unscoped admin sees the A2 expense', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'brand_expenses', brandA2ExpenseId);
	});
});
