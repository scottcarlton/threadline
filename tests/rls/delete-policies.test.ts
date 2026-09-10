import { afterAll, beforeAll, describe, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import { expectDeleteAllowed, expectDeleteDenied, expectVisible } from './setup/assert.js';

/**
 * DELETE coverage for the RLS suite. Every other spec file in tests/rls
 * proves SELECT and (partially) INSERT/UPDATE; nothing anywhere issues a
 * DELETE through a persona client. Every delete in the rest of the suite
 * is service-role cleanup, which bypasses RLS entirely. A wide-open
 * cross-org DELETE policy would pass the whole suite green today.
 *
 * These are characterization tests. The policies already exist and are
 * correct until proven otherwise: a failure here means the test's setup
 * or expectation is wrong, not the policy. See the module-level comments
 * in each section for the query used to read the live policy.
 */

beforeAll(loadPersonaIds);

// ---------------------------------------------------------------------
// Section A: cross-org DELETE denial, table-driven with positive controls
// ---------------------------------------------------------------------

type DeleteProbe = {
	table: string;
	row: () => Record<string, unknown>;
};

/**
 * Parent rows some probes need to satisfy a NOT NULL foreign key
 * (product_images needs a product, order_lines needs the fixture's own
 * order). Owned by Rep A, created once in beforeAll, deleted once in
 * afterAll.
 *
 * crossOrgProbes below is a plain module-level array, not populated
 * inside beforeAll: it.each needs the list at collection time, before any
 * hook runs. Only the product_images row's `product_id` needs
 * helperIds.imageProductId, and that closure isn't invoked until each
 * individual test body runs, by which point beforeAll has already
 * populated it.
 */
let helperIds: { imageProductId: string };

const crossOrgProbes: DeleteProbe[] = [
	// Own-org family. Row shapes copied from own-org.test.ts's probes
	// array, which are already correct against this schema.
	{
		table: 'seasons',
		row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Season' })
	},
	{
		table: 'shows',
		row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Show' })
	},
	{
		table: 'source_types',
		row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Source' })
	},
	{
		table: 'appointments',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			notes: 'RLS Delete Probe Appointment',
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
		table: 'organization_shipping_methods',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			name: 'RLS Delete Probe Shipping',
			cost_type: 'flat'
		})
	},

	// Federation-aware family. New rows owned by Rep A, distinct from
	// the shared fixture rows so this file never disturbs other specs.
	{
		table: 'brands',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			name: 'RLS Delete Probe Brand',
			is_active: true
		})
	},
	{
		table: 'products',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			brand_id: RLS_IDS.brandRepAOwn,
			name: 'RLS Delete Probe Product',
			style_number: 'RLS-DEL-PROD'
		})
	},
	{
		table: 'product_images',
		row: () => ({
			product_id: helperIds.imageProductId,
			file_path: 'rls-probe/delete-probe-image.jpg'
		})
	},
	{
		table: 'accounts',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			business_name: 'RLS Delete Probe Account'
		})
	},
	{
		table: 'account_locations',
		row: () => ({
			account_id: RLS_IDS.accountRepA,
			organization_id: RLS_IDS.orgRepA,
			label: 'RLS Delete Probe Location'
		})
	},
	{
		table: 'brand_assets',
		row: () => ({
			brand_id: RLS_IDS.brandRepAOwn,
			organization_id: RLS_IDS.orgRepA,
			name: 'RLS Delete Probe Asset',
			file_path: 'rls-probe/delete-probe-asset.pdf'
		})
	},
	{
		table: 'account_tags',
		row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Tag' })
	},

	// Explicit federation family.
	{
		table: 'order_lines',
		row: () => ({
			order_id: RLS_IDS.orderRepAOnBrandA,
			product_id: RLS_IDS.productA1,
			variant_id: RLS_IDS.variantA1,
			style_number: 'RLS-A1',
			color: 'Black',
			size: 'M',
			qty: 1,
			unit_price: 50
		})
	},
	// order_comments' DELETE grant ("Users can delete their own comments")
	// is `author_id = auth.uid()` only -- there is no org-membership
	// clause on it at all, unlike every other table in this sweep. The
	// denial/allowed pair below still holds (repBAdmin genuinely is not
	// the author; repAAdmin genuinely is), but it proves author-identity
	// scoping, not an org boundary, even though it sits in this list
	// alongside tables where the mechanism is org-role.
	{
		table: 'order_comments',
		row: () => ({
			order_id: RLS_IDS.orderRepAOnBrandA,
			author_id: PERSONA_IDS.repAAdmin,
			body: 'RLS delete probe comment',
			source_org_id: RLS_IDS.orgRepA
		})
	},

	// Connection management family.
	{
		table: 'connection_members',
		row: () => ({ org_connection_id: RLS_IDS.connActive, profile_id: PERSONA_IDS.repASales })
	}
];

beforeAll(async () => {
	const admin = adminClient();

	const { data: imageProduct, error: imageProductErr } = await admin
		.from('products')
		.insert({
			organization_id: RLS_IDS.orgRepA,
			brand_id: RLS_IDS.brandRepAOwn,
			name: 'RLS Delete Probe Image Host Product',
			style_number: 'RLS-DEL-IMG'
		})
		.select('id')
		.single();
	if (imageProductErr) {
		throw new Error(`helper product for product_images insert failed: ${imageProductErr.message}`);
	}
	helperIds = { imageProductId: (imageProduct as { id: string }).id };
});

afterAll(async () => {
	if (!helperIds) return;
	// Cascades product_images, but the probe test already deletes its own
	// row via the owner's positive control; explicit delete here just
	// tolerates whichever state it was left in.
	await adminClient().from('products').delete().eq('id', helperIds.imageProductId);
});

async function insertProbe(probe: DeleteProbe): Promise<string> {
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

describe('cross-org DELETE denial (with owner positive control)', () => {
	// it.each rather than one it looping every table: a throw on table 3
	// used to fail the whole run without saying anything about tables 4
	// through 16, and identifying the failing table needed the stack
	// trace. Splitting means each table reports pass/fail independently
	// and by name. The denial-then-owner-positive-control ordering inside
	// each case is unchanged.
	it.each(crossOrgProbes)('$table: outsider denied, owning org admin allowed', async (probe) => {
		const outsider = await personaClient('repBAdmin');
		const owner = await personaClient('repAAdmin');

		const id = await insertProbe(probe);
		let deletedByOwner = false;
		try {
			// 1. Outsider org cannot delete the row.
			await expectDeleteDenied(outsider, probe.table, id);

			// 2. The owning org's admin genuinely can. This positive
			// control is essential: without it, the denial above could
			// pass simply because nobody at all can delete this table,
			// which is exactly the false confidence this suite exists to
			// remove. If this assertion fails, that is a finding to
			// report, not a reason to drop the table from the list.
			await expectDeleteAllowed(owner, probe.table, id);
			deletedByOwner = true;
		} finally {
			if (!deletedByOwner) {
				await adminClient().from(probe.table).delete().eq('id', id);
			}
		}
	});
});

// ---------------------------------------------------------------------
// Section B: the no-delete-policy guarantee
// ---------------------------------------------------------------------

describe('tables with no DELETE-capable policy deny deletion even to the owning org', () => {
	// These five tables carry zero DELETE-capable policy (polcmd in ('d',
	// '*')) in the live database:
	//
	//   docker exec supabase_db_threadline psql -U postgres -d postgres -t -A -c \
	//     "select relname from pg_class c join pg_policy p on p.polrelid = c.oid \
	//      where c.relname in ('orders','organizations','profiles', \
	//      'invitations','federated_order_links') and p.polcmd in ('d','*');"
	//
	// returns zero rows. Deletion is impossible for any role subject to
	// RLS -- these tables are service-role-only by design (orders are
	// cancelled, not removed; organizations/profiles/invitations are
	// managed by admin flows that never hard-delete). If a future
	// migration adds a DELETE policy to any of these, this test must be
	// changed deliberately for it to keep passing.
	let invitationId: string;

	beforeAll(async () => {
		const { data, error } = await adminClient()
			.from('invitations')
			.insert({
				organization_id: RLS_IDS.orgRepA,
				email: 'rls-delete-probe@rls-test.threadline.local',
				invited_by: PERSONA_IDS.repAAdmin!
			})
			.select('id')
			.single();
		if (error) throw new Error(`invitations probe insert failed: ${error.message}`);
		invitationId = (data as { id: string }).id;
	});

	afterAll(async () => {
		if (!invitationId) return;
		await adminClient().from('invitations').delete().eq('id', invitationId);
	});

	it('orders cannot be deleted, even by the owning org admin', async () => {
		const repA = await personaClient('repAAdmin');
		await expectDeleteDenied(repA, 'orders', RLS_IDS.orderRepAOnBrandA);
		// Prove the row is still there and untouched.
		await expectVisible(repA, 'orders', RLS_IDS.orderRepAOnBrandA);
	});

	it('organizations cannot be deleted, even by the owning org admin', async () => {
		const repA = await personaClient('repAAdmin');
		await expectDeleteDenied(repA, 'organizations', RLS_IDS.orgRepA);
		await expectVisible(repA, 'organizations', RLS_IDS.orgRepA);
	});

	it('profiles cannot be deleted, even by the profile owner', async () => {
		const repA = await personaClient('repAAdmin');
		await expectDeleteDenied(repA, 'profiles', PERSONA_IDS.repAAdmin!);
		await expectVisible(repA, 'profiles', PERSONA_IDS.repAAdmin!);
	});

	it('invitations cannot be deleted, even by an org admin', async () => {
		const repA = await personaClient('repAAdmin');
		await expectDeleteDenied(repA, 'invitations', invitationId);
	});

	it('federated_order_links cannot be deleted, even by an involved org admin', async () => {
		const repA = await personaClient('repAAdmin');
		const { data, error } = await adminClient()
			.from('federated_order_links')
			.select('id')
			.eq('order_id', RLS_IDS.orderRepAOnBrandA)
			.single();
		if (error || !data) {
			throw new Error(`federated_order_links lookup failed: ${error?.message ?? 'no row found'}`);
		}
		const linkId = (data as { id: string }).id;
		await expectDeleteDenied(repA, 'federated_order_links', linkId);
	});
});

// ---------------------------------------------------------------------
// Section C: federation does not grant delete
// ---------------------------------------------------------------------

describe('federation grants visibility but never delete', () => {
	// A connected rep can READ a connected brand org's rows (proved
	// throughout federation-implicit.test.ts). Prove it cannot DELETE
	// them, and pair every denial with a read afterward so a passing test
	// can't be explained by the row having been invisible in the first
	// place.
	it('a connected rep can read but not delete the brand org brand', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'brands', RLS_IDS.brandA1);
		await expectDeleteDenied(repA, 'brands', RLS_IDS.brandA1);
		await expectVisible(repA, 'brands', RLS_IDS.brandA1);
	});

	it('a connected rep can read but not delete the brand org product', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'products', RLS_IDS.productA1);
		await expectDeleteDenied(repA, 'products', RLS_IDS.productA1);
		await expectVisible(repA, 'products', RLS_IDS.productA1);
	});

	it('a connected rep can read but not delete the brand org account', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'accounts', RLS_IDS.accountBrandA);
		await expectDeleteDenied(repA, 'accounts', RLS_IDS.accountBrandA);
		await expectVisible(repA, 'accounts', RLS_IDS.accountBrandA);
	});
});

// ---------------------------------------------------------------------
// Section D: role gradient on delete
// ---------------------------------------------------------------------

describe('role-differentiated DELETE policies', () => {
	// expense_receipts: "Can delete receipts for own draft expenses or
	// admin" --
	//   docker exec supabase_db_threadline psql -U postgres -d postgres -t -A -c \
	//     "select polname, coalesce(pg_get_expr(polqual,polrelid),'-') from pg_policy \
	//      where polrelid='public.expense_receipts'::regclass and polcmd in ('d','*');"
	//
	//   (expense_id IN (SELECT brand_expenses.id FROM brand_expenses WHERE
	//     ((brand_expenses.submitted_by = auth.uid()) AND
	//      (brand_expenses.status = 'draft'::expense_status))
	//     OR (get_user_role(brand_expenses.organization_id) = ANY
	//        (ARRAY['admin'::user_role, 'owner'::user_role]))))
	//
	// Two independent grants OR'd together: the submitter of a still-draft
	// expense, or an org admin/owner regardless of submitter or status.
	describe('expense_receipts: own draft expense OR org admin/owner', () => {
		let ownDraftExpenseId: string;
		let ownDraftReceiptId: string;
		let othersSubmittedExpenseId: string;
		let othersSubmittedReceiptId: string;

		beforeAll(async () => {
			const admin = adminClient();

			const { data: ownDraftExpense, error: ownDraftErr } = await admin
				.from('brand_expenses')
				.insert({
					organization_id: RLS_IDS.orgRepA,
					brand_id: RLS_IDS.brandRepAOwn,
					description: 'RLS delete probe own draft expense',
					amount: 5,
					status: 'draft',
					submitted_by: PERSONA_IDS.repASales!
				})
				.select('id')
				.single();
			if (ownDraftErr) throw new Error(`own draft expense insert failed: ${ownDraftErr.message}`);
			ownDraftExpenseId = (ownDraftExpense as { id: string }).id;

			const { data: ownDraftReceipt, error: ownDraftReceiptErr } = await admin
				.from('expense_receipts')
				.insert({
					expense_id: ownDraftExpenseId,
					organization_id: RLS_IDS.orgRepA,
					name: 'RLS delete probe own draft receipt',
					file_path: 'rls-probe/own-draft-receipt.pdf'
				})
				.select('id')
				.single();
			if (ownDraftReceiptErr) {
				throw new Error(`own draft receipt insert failed: ${ownDraftReceiptErr.message}`);
			}
			ownDraftReceiptId = (ownDraftReceipt as { id: string }).id;

			// Submitted by the admin, so a non-admin, non-submitter (sales)
			// cannot delete it under either clause.
			const { data: othersExpense, error: othersErr } = await admin
				.from('brand_expenses')
				.insert({
					organization_id: RLS_IDS.orgRepA,
					brand_id: RLS_IDS.brandRepAOwn,
					description: 'RLS delete probe admin-submitted expense',
					amount: 7,
					status: 'draft',
					submitted_by: PERSONA_IDS.repAAdmin!
				})
				.select('id')
				.single();
			if (othersErr) throw new Error(`admin-submitted expense insert failed: ${othersErr.message}`);
			othersSubmittedExpenseId = (othersExpense as { id: string }).id;

			const { data: othersReceipt, error: othersReceiptErr } = await admin
				.from('expense_receipts')
				.insert({
					expense_id: othersSubmittedExpenseId,
					organization_id: RLS_IDS.orgRepA,
					name: 'RLS delete probe admin-submitted receipt',
					file_path: 'rls-probe/admin-submitted-receipt.pdf'
				})
				.select('id')
				.single();
			if (othersReceiptErr) {
				throw new Error(`admin-submitted receipt insert failed: ${othersReceiptErr.message}`);
			}
			othersSubmittedReceiptId = (othersReceipt as { id: string }).id;
		});

		afterAll(async () => {
			const admin = adminClient();
			const expenseIds = [ownDraftExpenseId, othersSubmittedExpenseId].filter(Boolean);
			if (expenseIds.length > 0) {
				await admin.from('brand_expenses').delete().in('id', expenseIds);
			}
		});

		it('the submitter can delete a receipt on their own draft expense', async () => {
			const repASales = await personaClient('repASales');
			await expectDeleteAllowed(repASales, 'expense_receipts', ownDraftReceiptId);
		});

		it('a non-submitter, non-admin cannot delete a draft receipt they did not submit', async () => {
			const repASales = await personaClient('repASales');
			await expectDeleteDenied(repASales, 'expense_receipts', othersSubmittedReceiptId);
		});

		it('an org admin can delete a receipt they did not submit', async () => {
			const repAAdmin = await personaClient('repAAdmin');
			await expectDeleteAllowed(repAAdmin, 'expense_receipts', othersSubmittedReceiptId);
		});
	});

	// products: "Admin can delete products" --
	//   USING (get_user_role(organization_id) = ANY
	//     (ARRAY['admin'::user_role, 'owner'::user_role]))
	//
	// Narrower than the INSERT/UPDATE policies on the same table (which
	// also allow 'member'): sales and member roles are excluded from
	// DELETE entirely.
	describe('products: admin/owner only, sales excluded', () => {
		let productId: string;

		beforeAll(async () => {
			const { data, error } = await adminClient()
				.from('products')
				.insert({
					organization_id: RLS_IDS.orgBrandA,
					brand_id: RLS_IDS.brandA1,
					name: 'RLS delete probe role-gradient product',
					style_number: 'RLS-DEL-GRAD'
				})
				.select('id')
				.single();
			if (error) throw new Error(`role-gradient product insert failed: ${error.message}`);
			productId = (data as { id: string }).id;
		});

		afterAll(async () => {
			if (!productId) return;
			await adminClient().from('products').delete().eq('id', productId);
		});

		it('a sales-role member of the owning org cannot delete a product', async () => {
			const brandASales = await personaClient('brandASales');
			await expectDeleteDenied(brandASales, 'products', productId);
		});

		it('an admin of the owning org can delete a product', async () => {
			const brandAAdmin = await personaClient('brandAAdmin');
			await expectDeleteAllowed(brandAAdmin, 'products', productId);
		});
	});
});
