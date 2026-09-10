import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { MEMBER_ROW_IDS, PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import {
	expectDeleteAllowed,
	expectDeleteAllowedByFilter,
	expectDeleteDenied,
	expectDeleteDeniedByFilter,
	expectVisible
} from './setup/assert.js';

/**
 * Suffix appended to identifiers this file creates outside the fixed-UUID
 * fixture (throwaway auth users, unique text columns), so two concurrent
 * `bun run test:rls` sessions against the same shared local database don't
 * collide on a unique constraint. The core fixture (RLS_IDS, PERSONA_EMAILS)
 * doesn't do this -- it relies on teardown-then-reseed -- but this file adds
 * genuinely new entities that aren't part of that reset cycle.
 */
const RUN_SUFFIX = Math.random().toString(36).slice(2, 10);

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
let helperIds: {
	imageProductId: string;
	orgAgentId: string;
	seasonId: string;
	showId: string;
	showDateId: string;
	accountTagId: string;
};

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
	},

	// --------------------------------------------------------------
	// DELETE sweep extension: 21 tables whose DELETE policy is a plain
	// org-scoped role check (admin/owner, or in a few cases a wider
	// non-guest/any-member grant -- see the per-table comments below)
	// and which fit this array's outsider-denied/owner-allowed shape
	// with no special axis. The five privilege-sensitive tables and the
	// per-user, composite-PK, and public-by-token tables that don't fit
	// this shape are covered in their own sections further down.
	// --------------------------------------------------------------

	// brand_terms: "Admin/owner can delete brand terms" -- USING
	// (get_user_role(organization_id) = ANY (ARRAY['admin','owner'])).
	{
		table: 'brand_terms',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			brand_id: RLS_IDS.brandRepAOwn,
			body: 'RLS delete probe terms body'
		})
	},
	// buyer_invitations: "Org admin/owner can delete buyer invitations".
	// SELECT on this table is public-by-token ("Anyone can read... by
	// token"), but DELETE has no token branch at all -- org admin/owner
	// only.
	{
		table: 'buyer_invitations',
		row: () => ({
			account_id: RLS_IDS.accountRepA,
			organization_id: RLS_IDS.orgRepA,
			email: `rls-delete-buyer-invite-${RUN_SUFFIX}@rls-test.threadline.local`,
			invited_by: PERSONA_IDS.repAAdmin
		})
	},
	// discovered_contacts: "Admins can delete discovered contacts".
	{
		table: 'discovered_contacts',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			email: `rls-delete-discovered-${RUN_SUFFIX}@rls-test.threadline.local`
		})
	},
	// insight_actions: "Admin/owner can delete insights".
	{
		table: 'insight_actions',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			insight_type: 'rls_probe',
			title: 'RLS Delete Probe Insight'
		})
	},
	// integration_connections: "Admin/owner can delete connections".
	{
		table: 'integration_connections',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			provider: 'rls_probe',
			access_token: 'rls-probe-token',
			connected_by: PERSONA_IDS.repAAdmin
		})
	},
	// member_brand_commissions: "Admin/owner can delete member brand
	// commissions".
	{
		table: 'member_brand_commissions',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			member_id: MEMBER_ROW_IDS.repASales,
			brand_id: RLS_IDS.brandRepAOwn,
			rate: 5
		})
	},
	// org_agent_triggers: "Admin/owner can delete triggers". Needs
	// helperIds.orgAgentId, a persistent agent distinct from the
	// ephemeral row the org_agents probe below creates and deletes on
	// every it.each run.
	{
		table: 'org_agent_triggers',
		row: () => ({
			agent_id: helperIds.orgAgentId,
			organization_id: RLS_IDS.orgRepA,
			trigger_type: 'event',
			event_name: 'rls_probe_event',
			trigger_prompt: 'RLS delete probe trigger'
		})
	},
	// org_agents: "Admin/owner can delete agents".
	{
		table: 'org_agents',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			name: 'RLS Delete Probe Agent',
			slug: `rls-delete-probe-agent-${RUN_SUFFIX}`,
			system_prompt: 'RLS delete probe',
			created_by: PERSONA_IDS.repAAdmin
		})
	},
	// organization_sales_tax_rates: "Admin/owner can delete sales tax
	// rates". tax_type is CHECKed to 'origin'/'destination'.
	{
		table: 'organization_sales_tax_rates',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			state_code: 'CA',
			rate: 5,
			tax_type: 'origin'
		})
	},
	// season_deliveries: "Admin/owner can delete deliveries". Needs
	// helperIds.seasonId.
	{
		table: 'season_deliveries',
		row: () => ({
			season_id: helperIds.seasonId,
			organization_id: RLS_IDS.orgRepA,
			label: 'RLS Delete Probe Delivery',
			delivery_month: 1,
			delivery_day: 1
		})
	},
	// show_date_documents: "Admin/owner can delete show date docs". Needs
	// helperIds.showDateId.
	{
		table: 'show_date_documents',
		row: () => ({
			show_date_id: helperIds.showDateId,
			organization_id: RLS_IDS.orgRepA,
			name: 'RLS Delete Probe Doc',
			file_path: 'rls-probe/delete-probe-doc.pdf'
		})
	},
	// show_dates: "Admin/owner can delete show dates". Needs
	// helperIds.showId; this creates its own, separate show_dates row
	// from helperIds.showDateId above (which persists for
	// show_date_documents/show_visits below).
	{
		table: 'show_dates',
		row: () => ({
			show_id: helperIds.showId,
			organization_id: RLS_IDS.orgRepA,
			year: 2026,
			month: 1
		})
	},
	// territories: "Admin/owner can delete territories".
	{
		table: 'territories',
		row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Territory' })
	},
	// account_brand_access: "Org admin/owner can delete brand access".
	{
		table: 'account_brand_access',
		row: () => ({
			account_id: RLS_IDS.accountRepA,
			brand_id: RLS_IDS.brandRepAOwn,
			organization_id: RLS_IDS.orgRepA
		})
	},
	// brand_sales_tax_rates: "Brand tax rates deleted by admin/owner" --
	// USING EXISTS (brands b WHERE b.id = brand_id AND
	// get_user_role(b.organization_id) IN admin/owner). No
	// organization_id column on this table; the owning org is resolved
	// through the brand.
	{
		table: 'brand_sales_tax_rates',
		row: () => ({ brand_id: RLS_IDS.brandRepAOwn, state_code: 'CA', rate: 5, tax_type: 'origin' })
	},
	// brand_shipping_methods: same shape as brand_sales_tax_rates, via
	// the brand's organization_id.
	{
		table: 'brand_shipping_methods',
		row: () => ({
			brand_id: RLS_IDS.brandRepAOwn,
			name: 'RLS Delete Probe Shipping Method',
			cost_type: 'flat'
		})
	},
	// product_variants: "Members can manage product variants" -- FOR ALL
	// USING EXISTS (products p WHERE p.id = product_id AND
	// get_user_role(p.organization_id) IN admin/owner/member). Wider than
	// the admin-only tables above (member can also delete), but repAAdmin
	// is a member of that set, so the generic owner-allowed control still
	// holds. Uses helperIds.imageProductId (a Rep A-owned product) rather
	// than productA1, which belongs to Brand A -- the owner persona in
	// this array is always repAAdmin, so the probe row must be owned by
	// Rep A for the positive control to mean anything.
	{
		table: 'product_variants',
		row: () => ({
			product_id: helperIds.imageProductId,
			color: 'Red',
			size: 'S',
			sku: `RLS-DEL-VARIANT-${RUN_SUFFIX}`
		})
	},
	// show_visits: "Admin/owner/member can delete show visits". Needs
	// helperIds.showDateId.
	{
		table: 'show_visits',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			show_date_id: helperIds.showDateId,
			account_id: RLS_IDS.accountRepA,
			status: 'saw'
		})
	},
	// account_tag_assignments: "Non-guest users can manage tag
	// assignments" -- FOR ALL USING (account_id IN accounts owned by an
	// org where the caller is a member with role <> 'guest'). Wider than
	// admin-only, but repAAdmin (non-guest) still validates the
	// owner-allowed control. Needs helperIds.accountTagId.
	{
		table: 'account_tag_assignments',
		row: () => ({ account_id: RLS_IDS.accountRepA, tag_id: helperIds.accountTagId })
	},
	// email_templates: "Non-guest users can manage templates" -- same
	// non-guest shape as account_tag_assignments.
	{
		table: 'email_templates',
		row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Template' })
	},
	// email_links: "Org members can delete email links" -- USING
	// is_org_member(organization_id). Widest grant in this batch: any
	// role, including guest, can delete. repAAdmin is still a member, so
	// the owner-allowed control holds; there's no room here to also prove
	// a guest can delete without adding a whole new persona-role probe,
	// which is out of scope for the generic array.
	{
		table: 'email_links',
		row: () => ({
			organization_id: RLS_IDS.orgRepA,
			gmail_message_id: `rls-probe-msg-${RUN_SUFFIX}`,
			entity_type: 'account',
			entity_id: RLS_IDS.accountRepA
		})
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

	const { data: orgAgent, error: orgAgentErr } = await admin
		.from('org_agents')
		.insert({
			organization_id: RLS_IDS.orgRepA,
			name: 'RLS Delete Probe Agent Host',
			slug: `rls-delete-probe-agent-host-${RUN_SUFFIX}`,
			system_prompt: 'RLS delete probe host agent',
			created_by: PERSONA_IDS.repAAdmin!
		})
		.select('id')
		.single();
	if (orgAgentErr) {
		throw new Error(`helper org_agents insert failed: ${orgAgentErr.message}`);
	}

	const { data: season, error: seasonErr } = await admin
		.from('seasons')
		.insert({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Season Host' })
		.select('id')
		.single();
	if (seasonErr) {
		throw new Error(`helper seasons insert failed: ${seasonErr.message}`);
	}

	const { data: show, error: showErr } = await admin
		.from('shows')
		.insert({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Show Host' })
		.select('id')
		.single();
	if (showErr) {
		throw new Error(`helper shows insert failed: ${showErr.message}`);
	}
	const showId = (show as { id: string }).id;

	const { data: showDate, error: showDateErr } = await admin
		.from('show_dates')
		.insert({ show_id: showId, organization_id: RLS_IDS.orgRepA, year: 2026, month: 6 })
		.select('id')
		.single();
	if (showDateErr) {
		throw new Error(`helper show_dates insert failed: ${showDateErr.message}`);
	}

	const { data: accountTag, error: accountTagErr } = await admin
		.from('account_tags')
		.insert({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Tag Host' })
		.select('id')
		.single();
	if (accountTagErr) {
		throw new Error(`helper account_tags insert failed: ${accountTagErr.message}`);
	}

	helperIds = {
		imageProductId: (imageProduct as { id: string }).id,
		orgAgentId: (orgAgent as { id: string }).id,
		seasonId: (season as { id: string }).id,
		showId,
		showDateId: (showDate as { id: string }).id,
		accountTagId: (accountTag as { id: string }).id
	};
});

afterAll(async () => {
	if (!helperIds) return;
	const admin = adminClient();
	// Each delete cascades its dependents (product_images; org_agent_triggers;
	// show_dates -> show_date_documents/show_visits; season_deliveries;
	// account_tag_assignments). The probe tests that touch these rows
	// already delete their own rows via the owner's positive control;
	// deleting the helper parents here just tolerates whichever state was
	// left behind.
	await admin.from('products').delete().eq('id', helperIds.imageProductId);
	await admin.from('org_agents').delete().eq('id', helperIds.orgAgentId);
	await admin.from('shows').delete().eq('id', helperIds.showId);
	await admin.from('seasons').delete().eq('id', helperIds.seasonId);
	await admin.from('account_tags').delete().eq('id', helperIds.accountTagId);
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

		// brand_expenses itself (the parent this whole describe block seeds
		// but, until now, only ever touched with the admin client) has the
		// identical two-clause shape as expense_receipts: "Users can delete
		// expenses" -- USING ((submitted_by = auth.uid() AND status =
		// 'draft') OR get_user_role(organization_id) IN admin/owner). Its
		// own receipts are gone by this point (deleted above), so these
		// three run last in this describe and consume the two expense rows
		// the beforeAll seeded.
		it('the submitter can delete their own draft expense', async () => {
			const repASales = await personaClient('repASales');
			await expectDeleteAllowed(repASales, 'brand_expenses', ownDraftExpenseId);
		});

		it('a non-submitter, non-admin cannot delete a draft expense they did not submit', async () => {
			const repASales = await personaClient('repASales');
			await expectDeleteDenied(repASales, 'brand_expenses', othersSubmittedExpenseId);
		});

		it('an org admin can delete an expense they did not submit', async () => {
			const repAAdmin = await personaClient('repAAdmin');
			await expectDeleteAllowed(repAAdmin, 'brand_expenses', othersSubmittedExpenseId);
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

// ---------------------------------------------------------------------
// Section E: per-user tables (auth.uid()-scoped, no org disjunct)
// ---------------------------------------------------------------------

describe('per-user DELETE policies (auth.uid(), not org-scoped)', () => {
	// cart_items, email_connections, and notification_preferences gate
	// DELETE purely on profile_id/user_id = auth.uid(), the same shape
	// own-org.test.ts documents for their SELECT policies. An outsider-org
	// negative (repBAdmin) would differ from the owner on both the org
	// axis and the user axis at once, so it can't isolate which one is
	// doing the denying. The negative here is repASales instead: same org
	// as the owner (repAAdmin), different user. A denial can only be
	// explained by auth.uid() scoping.
	//
	//   cart_items: "Users delete own cart" -- USING (profile_id = auth.uid())
	//   email_connections: "Users can delete own email connections" --
	//     USING (profile_id = auth.uid())
	//   notification_preferences: "Users can manage their own preferences"
	//     -- FOR ALL USING (user_id = auth.uid())

	it('cart_items: owner can delete, same-org non-owner cannot', async () => {
		const owner = await personaClient('repAAdmin');
		const sameOrgNonOwner = await personaClient('repASales');

		const { data, error } = await adminClient()
			.from('cart_items')
			.insert({ profile_id: PERSONA_IDS.repAAdmin!, product_id: RLS_IDS.productA1 })
			.select('id')
			.single();
		expect(error).toBeNull();
		const id = (data as { id: string }).id;
		try {
			await expectDeleteDenied(sameOrgNonOwner, 'cart_items', id);
			await expectDeleteAllowed(owner, 'cart_items', id);
		} finally {
			await adminClient().from('cart_items').delete().eq('id', id);
		}
	});

	it('email_connections: owner can delete, same-org non-owner cannot', async () => {
		const owner = await personaClient('repAAdmin');
		const sameOrgNonOwner = await personaClient('repASales');

		const { data, error } = await adminClient()
			.from('email_connections')
			.insert({
				profile_id: PERSONA_IDS.repAAdmin!,
				provider: 'rls-delete-probe',
				email_address: `rls-delete-probe-${RUN_SUFFIX}@rls-test.threadline.local`,
				access_token: 'rls-probe-access',
				refresh_token: 'rls-probe-refresh'
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		const id = (data as { id: string }).id;
		try {
			await expectDeleteDenied(sameOrgNonOwner, 'email_connections', id);
			await expectDeleteAllowed(owner, 'email_connections', id);
		} finally {
			await adminClient().from('email_connections').delete().eq('id', id);
		}
	});

	it('notification_preferences: owner can delete, same-org non-owner cannot', async () => {
		const owner = await personaClient('repAAdmin');
		const sameOrgNonOwner = await personaClient('repASales');

		const { data, error } = await adminClient()
			.from('notification_preferences')
			.insert({ user_id: PERSONA_IDS.repAAdmin!, organization_id: RLS_IDS.orgRepA })
			.select('id')
			.single();
		expect(error).toBeNull();
		const id = (data as { id: string }).id;
		try {
			await expectDeleteDenied(sameOrgNonOwner, 'notification_preferences', id);
			await expectDeleteAllowed(owner, 'notification_preferences', id);
		} finally {
			await adminClient().from('notification_preferences').delete().eq('id', id);
		}
	});
});

// ---------------------------------------------------------------------
// Section F: composite-primary-key table
// ---------------------------------------------------------------------

describe('member_territories: composite PK, admin/owner via territory ownership', () => {
	// "Admin/owner can delete member territories" -- USING (territory_id
	// IN territories WHERE get_user_role(territories.organization_id) IN
	// admin/owner). No `id` column; addressed by the keyless filter
	// helpers, on (organization_member_id, territory_id).
	let territoryId: string;

	beforeAll(async () => {
		const { data, error } = await adminClient()
			.from('territories')
			.insert({ organization_id: RLS_IDS.orgRepA, name: 'RLS Delete Probe Composite Territory' })
			.select('id')
			.single();
		if (error) throw new Error(`helper territory insert failed: ${error.message}`);
		territoryId = (data as { id: string }).id;
	});

	afterAll(async () => {
		if (!territoryId) return;
		// Cascades member_territories.
		await adminClient().from('territories').delete().eq('id', territoryId);
	});

	it('outsider org cannot delete, owning org admin can', async () => {
		const outsider = await personaClient('repBAdmin');
		const owner = await personaClient('repAAdmin');

		const filter = { organization_member_id: MEMBER_ROW_IDS.repASales!, territory_id: territoryId };
		const { error: insertErr } = await adminClient().from('member_territories').insert(filter);
		if (insertErr) throw new Error(`member_territories probe insert failed: ${insertErr.message}`);

		let deletedByOwner = false;
		try {
			await expectDeleteDeniedByFilter(outsider, 'member_territories', filter);
			await expectDeleteAllowedByFilter(owner, 'member_territories', filter);
			deletedByOwner = true;
		} finally {
			if (!deletedByOwner) {
				await adminClient()
					.from('member_territories')
					.delete()
					.eq('organization_member_id', filter.organization_member_id)
					.eq('territory_id', filter.territory_id);
			}
		}
	});
});

// ---------------------------------------------------------------------
// Section G: public-by-token tables (permissive SELECT, narrower DELETE)
// ---------------------------------------------------------------------

describe('public-by-token tables: DELETE is brand-admin only, not token-holder', () => {
	// connection_invites: SELECT has a `true` branch ("Anyone can read
	// invite by code"), but the only DELETE-capable policy is "Brand
	// admin can manage invites" -- FOR ALL USING (brand_org_id IN orgs
	// where the caller is admin/owner). Note this is BRAND-side only:
	// Rep A created the active connection this invite's brand belongs to,
	// but repAAdmin has no delete grant on connection_invites at all --
	// only an admin/owner of the brand org does.
	it('connection_invites: brand admin can delete, outsider and the connected rep admin cannot', async () => {
		const outsider = await personaClient('repBAdmin');
		const repSideAdmin = await personaClient('repAAdmin');
		const brandAdmin = await personaClient('brandAAdmin');

		// Don't insert a fresh row: trg_create_connection_invite fires
		// AFTER INSERT on organizations and already gave Brand A exactly
		// one connection_invites row when the fixture seeded orgBrandA
		// (public-token.test.ts's own comment documents this same
		// invariant). connection_invites_one_per_org is a UNIQUE index on
		// brand_org_id alone, so a second insert for the same org 42501s
		// on a constraint violation, not an RLS denial. Use that row.
		const { data: existing, error: lookupErr } = await adminClient()
			.from('connection_invites')
			.select('id')
			.eq('brand_org_id', RLS_IDS.orgBrandA)
			.single();
		if (lookupErr || !existing) {
			throw new Error(
				`connection_invites lookup for Brand A failed: ${lookupErr?.message ?? 'no row found'}`
			);
		}
		const id = (existing as { id: string }).id;

		let deletedByBrandAdmin = false;
		try {
			await expectDeleteDenied(outsider, 'connection_invites', id);
			await expectDeleteDenied(repSideAdmin, 'connection_invites', id);
			await expectDeleteAllowed(brandAdmin, 'connection_invites', id);
			deletedByBrandAdmin = true;
		} finally {
			if (!deletedByBrandAdmin) {
				await adminClient().from('connection_invites').delete().eq('id', id);
			}
			// The one-per-org invariant this row satisfies is relied on by
			// public-token.test.ts ("Brand A already has one"), so restore
			// it regardless of which spec file runs next.
			await adminClient().from('connection_invites').insert({ brand_org_id: RLS_IDS.orgBrandA });
		}
	});

	// connection_member_invites: SELECT is `true` ("readable by token"),
	// but DELETE is "brand admin/owner writes" -- FOR ALL USING
	// (org_connection_id IN connections whose brand_org_id the caller
	// admins). Uses the existing active connection (brand_org_id =
	// orgBrandA), so brandAAdmin is the positive control.
	it('connection_member_invites: brand admin can delete, outsider cannot', async () => {
		const outsider = await personaClient('repBAdmin');
		const brandAdmin = await personaClient('brandAAdmin');

		const { data, error } = await adminClient()
			.from('connection_member_invites')
			.insert({
				org_connection_id: RLS_IDS.connActive,
				target_email: `rls-delete-probe-member-invite-${RUN_SUFFIX}@rls-test.threadline.local`
			})
			.select('id')
			.single();
		if (error) {
			throw new Error(`connection_member_invites probe insert failed: ${error.message}`);
		}
		const id = (data as { id: string }).id;

		let deletedByBrandAdmin = false;
		try {
			await expectDeleteDenied(outsider, 'connection_member_invites', id);
			await expectDeleteAllowed(brandAdmin, 'connection_member_invites', id);
			deletedByBrandAdmin = true;
		} finally {
			if (!deletedByBrandAdmin) {
				await adminClient().from('connection_member_invites').delete().eq('id', id);
			}
		}
	});
});

// ---------------------------------------------------------------------
// Section H: org_setup_status -- FOR ALL, any org role (no admin gate)
// ---------------------------------------------------------------------

describe('org_setup_status: FOR ALL policy grants delete to any org member, not just admin', () => {
	// org_setup_status has no dedicated DELETE policy; the only
	// DELETE-capable policy is org_setup_status_all, FOR ALL USING
	// (organization_id IN orgs the caller belongs to -- ANY role,
	// including guest, per organization_members.profile_id = auth.uid()
	// with no role filter at all). This is the correct read of a FOR ALL
	// policy: it stands in for every command, so DELETE inherits this
	// same-org-member check with no additional narrowing. Deliberately
	// wide, not a bug -- org_setup_status just tracks onboarding
	// checklist progress, not sensitive data -- but worth characterizing
	// explicitly since every other admin-gated table in this sweep would
	// make "any role" look like a mistake if this one weren't called out.
	it('outsider org is denied; a non-admin member of the owning org is allowed', async () => {
		const outsider = await personaClient('repBAdmin');
		const sameOrgSales = await personaClient('repASales');

		const { data, error } = await adminClient()
			.from('org_setup_status')
			.insert({ organization_id: RLS_IDS.orgRepA, section: `rls_probe_${RUN_SUFFIX}` })
			.select('id')
			.single();
		if (error) throw new Error(`org_setup_status probe insert failed: ${error.message}`);
		const id = (data as { id: string }).id;

		let deletedBySales = false;
		try {
			await expectDeleteDenied(outsider, 'org_setup_status', id);
			await expectDeleteAllowed(sameOrgSales, 'org_setup_status', id);
			deletedBySales = true;
		} finally {
			if (!deletedBySales) {
				await adminClient().from('org_setup_status').delete().eq('id', id);
			}
		}
	});
});

// ---------------------------------------------------------------------
// Section I: five privilege-sensitive tables -- role gradient, not just
// cross-org denial. Deleting any of these changes who can access what,
// so the denial that matters most is a same-org actor without the
// admin/owner role, not only an outsider org.
// ---------------------------------------------------------------------

describe('privilege-sensitive DELETE policies: role gradient inside the owning org', () => {
	// organization_members: "Admin/owner can delete members" -- USING
	// (get_member_role_in_org(organization_id) IN admin/owner). A
	// cross-org delete here would let one org remove another org's
	// members outright; a same-org non-admin delete would let any member
	// remove teammates. Needs a throwaway member row: every fixture
	// persona already has a fixed membership the rest of the suite
	// depends on, so this creates its own auth user (profiles row via the
	// on_auth_user_created trigger) and membership, cleaned up here
	// rather than relying on global teardown.
	describe('organization_members', () => {
		const email = `rls-delete-probe-member-${RUN_SUFFIX}@rls-test.threadline.local`;
		let throwawayProfileId: string;
		let membershipId: string;

		beforeAll(async () => {
			const admin = adminClient();
			const { data: user, error: userErr } = await admin.auth.admin.createUser({
				email,
				password: 'rls-test-pw!',
				email_confirm: true
			});
			if (userErr || !user.user) {
				throw new Error(`throwaway user creation failed: ${userErr?.message}`);
			}
			throwawayProfileId = user.user.id;

			const { data: membership, error: membershipErr } = await admin
				.from('organization_members')
				.insert({
					organization_id: RLS_IDS.orgRepA,
					profile_id: throwawayProfileId,
					role: 'member',
					accepted_at: new Date().toISOString()
				})
				.select('id')
				.single();
			if (membershipErr) {
				throw new Error(`throwaway membership insert failed: ${membershipErr.message}`);
			}
			membershipId = (membership as { id: string }).id;
		});

		afterAll(async () => {
			const admin = adminClient();
			if (throwawayProfileId) {
				// Cascades organization_members via profiles_id_fkey ->
				// organization_members_profile_id_fkey (ON DELETE CASCADE).
				await admin.auth.admin.deleteUser(throwawayProfileId);
			}
		});

		it('outsider org cannot delete a member row', async () => {
			const outsider = await personaClient('repBAdmin');
			await expectDeleteDenied(outsider, 'organization_members', membershipId);
			await expectVisible(adminClient(), 'organization_members', membershipId);
		});

		it('a sales-role member of the owning org cannot delete a teammate', async () => {
			const sales = await personaClient('repASales');
			await expectDeleteDenied(sales, 'organization_members', membershipId);
			await expectVisible(adminClient(), 'organization_members', membershipId);
		});

		it('an admin of the owning org can delete a member row', async () => {
			const admin = await personaClient('repAAdmin');
			await expectDeleteAllowed(admin, 'organization_members', membershipId);
		});
	});

	// org_connections: "Admin can delete own-side connections" -- USING
	// (rep_org_id IN orgs where caller is admin/owner) OR (brand_org_id IN
	// orgs where caller is admin/owner). Deleting severs a federation
	// relationship for both sides at once. Uses a fresh connection
	// (orgRepA <-> orgBrandB) rather than the shared connActive/connPending
	// fixture rows, which other spec files in this suite depend on.
	describe('org_connections', () => {
		let connectionId: string;

		beforeAll(async () => {
			const { data, error } = await adminClient()
				.from('org_connections')
				.insert({
					rep_org_id: RLS_IDS.orgRepA,
					brand_org_id: RLS_IDS.orgBrandB,
					status: 'pending',
					requested_by: PERSONA_IDS.repAAdmin!
				})
				.select('id')
				.single();
			if (error) throw new Error(`org_connections probe insert failed: ${error.message}`);
			connectionId = (data as { id: string }).id;
		});

		afterAll(async () => {
			if (!connectionId) return;
			await adminClient().from('org_connections').delete().eq('id', connectionId);
		});

		it('an org uninvolved in the connection cannot delete it', async () => {
			// brandAAdmin is admin of Brand A, which is neither side of this
			// Rep A <-> Brand B connection.
			const uninvolved = await personaClient('brandAAdmin');
			await expectDeleteDenied(uninvolved, 'org_connections', connectionId);
			await expectVisible(adminClient(), 'org_connections', connectionId);
		});

		it('a sales-role member on the rep side cannot sever the connection', async () => {
			const sales = await personaClient('repASales');
			await expectDeleteDenied(sales, 'org_connections', connectionId);
			await expectVisible(adminClient(), 'org_connections', connectionId);
		});

		it('an admin on either involved side can delete the connection', async () => {
			const repAdmin = await personaClient('repAAdmin');
			await expectDeleteAllowed(repAdmin, 'org_connections', connectionId);
		});
	});

	// member_brand_access: "Admin/owner can manage brand access" -- FOR
	// ALL USING (member_id IN organization_members rows owned by an org
	// where the caller is admin/owner). Deleting changes what a member
	// can see. member_id references repASales's own membership row, but
	// repASales themself (sales role) still cannot delete it -- only an
	// admin/owner of the org that owns that membership can.
	describe('member_brand_access', () => {
		let accessId: string;

		beforeAll(async () => {
			const { data, error } = await adminClient()
				.from('member_brand_access')
				.insert({
					member_id: MEMBER_ROW_IDS.repASales!,
					brand_id: RLS_IDS.brandRepAOwn,
					granted_by: PERSONA_IDS.repAAdmin!
				})
				.select('id')
				.single();
			if (error) throw new Error(`member_brand_access probe insert failed: ${error.message}`);
			accessId = (data as { id: string }).id;
		});

		afterAll(async () => {
			if (!accessId) return;
			await adminClient().from('member_brand_access').delete().eq('id', accessId);
		});

		it('outsider org cannot delete brand access', async () => {
			const outsider = await personaClient('repBAdmin');
			await expectDeleteDenied(outsider, 'member_brand_access', accessId);
			await expectVisible(adminClient(), 'member_brand_access', accessId);
		});

		it('the affected sales-role member cannot delete their own brand access grant', async () => {
			const sales = await personaClient('repASales');
			await expectDeleteDenied(sales, 'member_brand_access', accessId);
			await expectVisible(adminClient(), 'member_brand_access', accessId);
		});

		it('an admin of the owning org can delete a brand access grant', async () => {
			const admin = await personaClient('repAAdmin');
			await expectDeleteAllowed(admin, 'member_brand_access', accessId);
		});
	});

	// account_users: two independent DELETE-capable policies, OR'd by
	// Postgres RLS (a delete succeeds if either policy's USING passes):
	//   1. "Org admin/owner can delete account users" -- account_id IN
	//      accounts owned by an org where the caller is admin/owner.
	//   2. "Buyer admins can delete teammates from their accounts" --
	//      is_buyer_admin_of(account_id) AND profile_id <> auth.uid()
	//      (a buyer admin can remove a teammate, never themselves).
	// Deleting removes a buyer's access to their account, so both grants
	// and both exclusions are worth proving separately.
	describe('account_users', () => {
		let orgSideRowId: string;
		let teammateRowId: string;
		let buyerOwnRowId: string;

		beforeAll(async () => {
			const admin = adminClient();

			// The fixture's own buyer_admin row (seedAccounts inserts
			// account_id: accountBrandA, profile_id: PERSONA_IDS.buyer).
			// Looked up rather than hardcoded, since ids.ts doesn't carry an
			// id for this row.
			const { data: buyerRow, error: buyerRowErr } = await admin
				.from('account_users')
				.select('id')
				.eq('account_id', RLS_IDS.accountBrandA)
				.eq('profile_id', PERSONA_IDS.buyer!)
				.single();
			if (buyerRowErr || !buyerRow) {
				throw new Error(
					`fixture buyer account_users row lookup failed: ${buyerRowErr?.message ?? 'no row found'}`
				);
			}
			buyerOwnRowId = (buyerRow as { id: string }).id;
			// Row for the org-admin branch: profile_id doesn't need to be a
			// real buyer, the policy only cares about accounts.organization_id.
			const { data: orgSideRow, error: orgSideErr } = await admin
				.from('account_users')
				.insert({
					account_id: RLS_IDS.accountBrandA,
					profile_id: PERSONA_IDS.repASales!,
					role: 'buyer'
				})
				.select('id')
				.single();
			if (orgSideErr)
				throw new Error(`account_users org-side probe insert failed: ${orgSideErr.message}`);
			orgSideRowId = (orgSideRow as { id: string }).id;

			// Row for the buyer_admin-teammate branch: a second account_users
			// row on the same account as the fixture's buyer_admin (the
			// `buyer` persona), so that persona's is_buyer_admin_of() check
			// passes and it can attempt to remove this "teammate".
			const { data: teammateRow, error: teammateErr } = await admin
				.from('account_users')
				.insert({
					account_id: RLS_IDS.accountBrandA,
					profile_id: PERSONA_IDS.repBAdmin!,
					role: 'buyer'
				})
				.select('id')
				.single();
			if (teammateErr) {
				throw new Error(`account_users teammate probe insert failed: ${teammateErr.message}`);
			}
			teammateRowId = (teammateRow as { id: string }).id;
		});

		afterAll(async () => {
			const ids = [orgSideRowId, teammateRowId].filter(Boolean);
			if (ids.length > 0) {
				await adminClient().from('account_users').delete().in('id', ids);
			}
		});

		it('outsider org cannot delete an account user row (org-admin branch)', async () => {
			const outsider = await personaClient('repBAdmin');
			await expectDeleteDenied(outsider, 'account_users', orgSideRowId);
			await expectVisible(adminClient(), 'account_users', orgSideRowId);
		});

		it('a sales-role member of the owning org cannot delete an account user row', async () => {
			const sales = await personaClient('brandASales');
			await expectDeleteDenied(sales, 'account_users', orgSideRowId);
			await expectVisible(adminClient(), 'account_users', orgSideRowId);
		});

		it('an admin of the owning org can delete an account user row', async () => {
			const admin = await personaClient('brandAAdmin');
			await expectDeleteAllowed(admin, 'account_users', orgSideRowId);
		});

		it('a buyer admin cannot delete their own account_users row', async () => {
			const buyer = await personaClient('buyer');
			// The fixture's own buyer_admin row for this account -- profile_id
			// = auth.uid(), so the teammate clause's `profile_id <> auth.uid()`
			// excludes it, and the buyer isn't an org admin/owner either.
			await expectDeleteDenied(buyer, 'account_users', buyerOwnRowId);
			await expectVisible(adminClient(), 'account_users', buyerOwnRowId);
		});

		it('a buyer admin can delete a teammate on the same account', async () => {
			const buyer = await personaClient('buyer');
			await expectDeleteAllowed(buyer, 'account_users', teammateRowId);
		});
	});

	// organization_sso_providers: "Org admin/owner can delete SSO
	// providers" -- USING (get_user_role(organization_id) IN
	// admin/owner). Deleting disables SSO enforcement for that org, a
	// security downgrade rather than mere data loss.
	describe('organization_sso_providers', () => {
		let providerId: string;

		beforeAll(async () => {
			const { data, error } = await adminClient()
				.from('organization_sso_providers')
				.insert({
					organization_id: RLS_IDS.orgRepA,
					supabase_provider_id: `rls-delete-probe-sso-${RUN_SUFFIX}`,
					domain: `rls-delete-probe-${RUN_SUFFIX}.example.com`
				})
				.select('id')
				.single();
			if (error) {
				throw new Error(`organization_sso_providers probe insert failed: ${error.message}`);
			}
			providerId = (data as { id: string }).id;
		});

		afterAll(async () => {
			if (!providerId) return;
			await adminClient().from('organization_sso_providers').delete().eq('id', providerId);
		});

		it('outsider org cannot delete an SSO provider', async () => {
			const outsider = await personaClient('repBAdmin');
			await expectDeleteDenied(outsider, 'organization_sso_providers', providerId);
			await expectVisible(adminClient(), 'organization_sso_providers', providerId);
		});

		it('a sales-role member of the owning org cannot disable SSO', async () => {
			const sales = await personaClient('repASales');
			await expectDeleteDenied(sales, 'organization_sso_providers', providerId);
			await expectVisible(adminClient(), 'organization_sso_providers', providerId);
		});

		it('an admin of the owning org can delete an SSO provider', async () => {
			const admin = await personaClient('repAAdmin');
			await expectDeleteAllowed(admin, 'organization_sso_providers', providerId);
		});
	});
});
