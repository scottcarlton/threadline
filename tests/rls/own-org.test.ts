import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
 *
 * Phase assignment for tables not probed here:
 *
 * Federation-aware tables (§A.3 "Federation-aware tables (implicit via
 * get_connected_org_ids)"), covered by Phase 4:
 *   accounts, account_locations, account_tags, account_tag_assignments,
 *   brands, brand_assets, brand_expenses, expense_receipts, products,
 *   product_variants, product_images
 *
 * Explicit federation and connection management tables (§A.3 "Explicit
 * federation tables" and "Connection management tables"), covered by
 * Phase 5:
 *   orders, order_lines, order_comments, order_audits,
 *   federated_order_links, federated_account_links
 *   org_connections, connection_members -- §A.3 groups these under
 *     "Connection management tables" alongside the federated_*_links and
 *     invite tables, but neither is a federated_*_link nor carries a
 *     USING (true) policy, so they don't fit the Phase 5 / Phase 8 split
 *     given in the task brief cleanly. Judgment call: grouped with Phase 5
 *     since both grant visibility to members of either involved org
 *     (get_user_org_ids on either side), the same two-sided shape as the
 *     federated_*_links tables, not a single-org own-org shape.
 *
 * Buyer-facing tables, covered by Phase 7 (explicit task override; §A.3
 * itself lists account_brand_access, account_users, and cart_items under
 * different sections -- account_brand_access/account_users under
 * "Federation-aware tables", cart_items under "Own-org tables" -- but the
 * task brief for this suite calls out these three plus buyer paths on
 * orders as Phase 7 scope):
 *   account_brand_access, account_users, cart_items
 *
 * Public-by-token tables (§A.3 policies with a `true` / token-lookup
 * SELECT branch), covered by Phase 8:
 *   invitations, buyer_invitations, connection_invites,
 *   connection_member_invites
 *
 * Own-org tables (§A.3) that are NOT added to the generic probes array
 * below because they don't fit the "insert one row, check it" shape, but
 * are already exercised directly elsewhere in this file:
 *   organizations, profiles -- neither has an organization_id column: the
 *     row itself IS the org (or the user). Tested directly in the
 *     "organizations, members, and profiles respect org boundaries" block.
 *   organization_members -- has organization_id, but a probe row would
 *     collide with the fixture's UNIQUE (organization_id, profile_id)
 *     constraint (every persona already has a row for their org), and a
 *     genuinely new row would need a brand-new profile/auth.user just for
 *     this probe. Own-org isolation is already proven indirectly in the
 *     "organizations, members, and profiles respect org boundaries" block
 *     (Rep A's own organization_members query never returns Rep B's org).
 *   email_connections, notification_preferences, notifications -- these
 *     gate SELECT purely on profile_id/user_id = auth.uid(), with no
 *     org-membership disjunct at all. The generic loop's negative persona
 *     (repBAdmin) differs from the owner on both the org axis and the
 *     user axis at once, which can't isolate which axis is doing the
 *     hiding. Tested instead in the "user-scoped tables (no org disjunct)
 *     are hidden from a same-org non-owner" block, alongside cart_items,
 *     against repASales: a member of the SAME org as the owner but a
 *     different user, so a hidden row can only be explained by
 *     auth.uid() scoping.
 *
 * Own-org tables (§A.3) that have no `id` column, so the shared
 * insertProbe/visibleIds helpers (which SELECT 'id') cannot address a row
 * by id. Not probed anywhere; flagged here per the task brief:
 *   member_territories -- composite PK (organization_member_id,
 *     territory_id)
 *   order_views -- composite PK (order_id, profile_id)
 *
 * NOT documented anywhere in §A.3 at all (a gap in the permissions map,
 * discovered while enumerating `alter table ... enable row level
 * security` against the map). Phase assignment is deferred to whoever
 * owns that document, since the task's stated authority for phase
 * assignment (§A.3) says nothing about these tables. Read via
 * `docker exec supabase_db_threadline psql -U postgres -d postgres -c
 * "\d <table>"` to see what each one actually does today:
 *   ai_requests, audit_log, beta_whitelist -- zero policies listed for
 *     any of the three despite RLS being enabled, meaning normal
 *     authenticated/anon roles get zero rows (deny-all); only the
 *     service role (which bypasses RLS) can read or write them. Looks
 *     like deliberate backend-only telemetry, consistent across all
 *     three, not a broken policy -- but not proven deliberate by any
 *     doc either.
 *   brand_sales_tax_rates, brand_shipping_methods, brand_terms -- real
 *     policies exist and are federation-aware in shape (is_org_member OR
 *     brand's organization_id IN get_connected_org_ids()), functionally
 *     matching the Phase 4 group even though absent from that table.
 *   email_intakes, email_intake_line_resolutions -- org-member SELECT via
 *     an `organization_members` subquery, functionally own-org shaped.
 *   messaging_sessions, messaging_messages -- messaging_sessions has no
 *     policies listed either (same deny-all-but-service-role shape as
 *     ai_requests/audit_log/beta_whitelist); messaging_messages has none
 *     of its own and reaches rows only via its FK to messaging_sessions,
 *     which itself has no grant.
 *   messaging_verification_attempts -- composite PK (phone_number), no
 *     `id` column, and no policies listed (deny-all-but-service-role).
 *     Doubly unprobeable with the current helpers even if it had a phase.
 *   org_setup_status -- org-member SELECT/ALL via an
 *     `organization_members` subquery, functionally own-org shaped.
 */
type Probe = {
	table: string;
	row: () => Record<string, unknown>;
};

let probes: Probe[];

/**
 * Durable parent rows some own-org probes need to satisfy a NOT NULL
 * foreign key (show_dates needs a show, show_date_documents/show_visits
 * need a show_date, season_deliveries needs a season, integration_sync_log
 * needs an integration_connections row, org_agent_triggers/org_agent_runs
 * need an org_agent, expense_upload_tokens needs a brand_expenses row).
 * All owned by Rep A, created once in beforeAll, deleted once in afterAll;
 * cascading deletes clean up anything a probe forgot.
 */
let helperIds: {
	showId: string;
	showDateId: string;
	seasonId: string;
	integrationConnectionId: string;
	orgAgentId: string;
	brandExpenseId: string;
};

beforeAll(async () => {
	await loadPersonaIds();
	const admin = adminClient();

	const { data: show, error: showErr } = await admin
		.from('shows')
		.insert({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Parent Show' })
		.select('id')
		.single();
	if (showErr) throw new Error(`helper show insert failed: ${showErr.message}`);

	const { data: showDate, error: showDateErr } = await admin
		.from('show_dates')
		.insert({
			organization_id: RLS_IDS.orgRepA,
			show_id: (show as { id: string }).id,
			year: 2100,
			month: 1
		})
		.select('id')
		.single();
	if (showDateErr) throw new Error(`helper show_date insert failed: ${showDateErr.message}`);

	const { data: season, error: seasonErr } = await admin
		.from('seasons')
		.insert({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Parent Season' })
		.select('id')
		.single();
	if (seasonErr) throw new Error(`helper season insert failed: ${seasonErr.message}`);

	const { data: integrationConnection, error: integrationErr } = await admin
		.from('integration_connections')
		.insert({
			organization_id: RLS_IDS.orgRepA,
			provider: 'google_calendar',
			access_token: 'rls-probe-parent-token',
			connected_by: PERSONA_IDS.repAAdmin
		})
		.select('id')
		.single();
	if (integrationErr)
		throw new Error(`helper integration_connections insert failed: ${integrationErr.message}`);

	const { data: orgAgent, error: orgAgentErr } = await admin
		.from('org_agents')
		.insert({
			organization_id: RLS_IDS.orgRepA,
			name: 'RLS Probe Parent Agent',
			slug: 'rls-probe-parent-agent',
			system_prompt: 'RLS probe parent system prompt',
			created_by: PERSONA_IDS.repAAdmin
		})
		.select('id')
		.single();
	if (orgAgentErr) throw new Error(`helper org_agents insert failed: ${orgAgentErr.message}`);

	const { data: brandExpense, error: brandExpenseErr } = await admin
		.from('brand_expenses')
		.insert({
			organization_id: RLS_IDS.orgRepA,
			brand_id: RLS_IDS.brandRepAOwn,
			description: 'RLS probe parent expense',
			amount: 1,
			submitted_by: PERSONA_IDS.repAAdmin
		})
		.select('id')
		.single();
	if (brandExpenseErr)
		throw new Error(`helper brand_expenses insert failed: ${brandExpenseErr.message}`);

	helperIds = {
		showId: (show as { id: string }).id,
		showDateId: (showDate as { id: string }).id,
		seasonId: (season as { id: string }).id,
		integrationConnectionId: (integrationConnection as { id: string }).id,
		orgAgentId: (orgAgent as { id: string }).id,
		brandExpenseId: (brandExpense as { id: string }).id
	};

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
		},
		{
			table: 'organization_sso_providers',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				supabase_provider_id: 'rls-probe-sso-provider',
				domain: 'rls-probe.threadline.local'
			})
		},
		{
			table: 'ai_feedback',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				message_content: 'RLS probe message',
				response_content: 'RLS probe response',
				rating: 1
			})
		},
		{
			table: 'ai_usage_logs',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				endpoint: 'rls-probe-endpoint',
				purpose: 'rls-probe',
				model: 'rls-probe-model'
			})
		},
		{
			table: 'transactional_email_log',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				to_email: 'probe@rls-test.threadline.local',
				from_email: 'noreply@rls-test.threadline.local',
				subject: 'RLS Probe',
				template: 'rls_probe'
			})
		},
		{
			table: 'email_templates',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Template' })
		},
		{
			table: 'email_links',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				gmail_message_id: 'rls-probe-gmail-message',
				entity_type: 'account',
				entity_id: RLS_IDS.accountRepA
			})
		},
		{
			table: 'member_brand_access',
			row: () => ({ member_id: MEMBER_ROW_IDS.repAAdmin, brand_id: RLS_IDS.brandRepAOwn })
		},
		{
			table: 'integration_sync_log',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				connection_id: helperIds.integrationConnectionId,
				action: 'rls-probe-sync',
				status: 'success'
			})
		},
		{
			table: 'org_agent_triggers',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				agent_id: helperIds.orgAgentId,
				trigger_type: 'schedule',
				cron_expression: '0 0 * * *',
				trigger_prompt: 'RLS probe trigger prompt'
			})
		},
		{
			table: 'org_agent_runs',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				agent_id: helperIds.orgAgentId,
				triggered_by: 'rls-probe',
				input_prompt: 'RLS probe input'
			})
		},
		{
			table: 'expense_upload_tokens',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				expense_id: helperIds.brandExpenseId,
				token: 'rls-probe-upload-token',
				created_by: PERSONA_IDS.repAAdmin,
				expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
			})
		},
		{
			table: 'season_deliveries',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				season_id: helperIds.seasonId,
				label: 'RLS Probe Delivery',
				delivery_month: 3,
				delivery_day: 15
			})
		},
		{
			table: 'show_dates',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				show_id: helperIds.showId,
				year: 2099,
				month: 6
			})
		},
		{
			table: 'show_date_documents',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				show_date_id: helperIds.showDateId,
				name: 'RLS Probe Doc',
				file_path: 'rls-probe/doc.pdf'
			})
		},
		{
			table: 'show_visits',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				show_date_id: helperIds.showDateId,
				account_id: RLS_IDS.accountRepA
			})
		}
	];
});

afterAll(async () => {
	// If beforeAll threw before assigning helperIds (e.g. one of the helper
	// inserts failed), there is nothing to clean up here and dereferencing
	// helperIds would raise a TypeError that buries the real beforeAll
	// error under a confusing follow-on failure.
	if (!helperIds) return;

	const admin = adminClient();
	// Deleting the show cascades its show_dates, which cascades
	// show_date_documents and show_visits.
	await admin.from('shows').delete().eq('id', helperIds.showId);
	// Cascades season_deliveries.
	await admin.from('seasons').delete().eq('id', helperIds.seasonId);
	// Cascades expense_receipts and expense_upload_tokens.
	await admin.from('brand_expenses').delete().eq('id', helperIds.brandExpenseId);
	// Cascades org_agent_triggers and org_agent_runs.
	await admin.from('org_agents').delete().eq('id', helperIds.orgAgentId);
	// Cascades integration_sync_log.
	await admin.from('integration_connections').delete().eq('id', helperIds.integrationConnectionId);
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

	/**
	 * email_connections, notification_preferences, and notifications gate
	 * SELECT purely on `profile_id = auth.uid()` / `user_id = auth.uid()`,
	 * with no org-membership disjunct at all. Proving that with an outsider
	 * from a different org (like the generic own-org loop does) is
	 * ambiguous: repBAdmin differs from the owner on both the org axis and
	 * the user axis at once, so a hidden row could be explained by either.
	 * The negative persona here is repASales instead: a member of the SAME
	 * org as the owner, but a different user. Since org membership is
	 * identical for both personas, a hidden row can only be explained by
	 * auth.uid() scoping, which is what these policies actually promise.
	 */
	it('user-scoped tables (no org disjunct) are hidden from a same-org non-owner', async () => {
		const owner = await personaClient('repAAdmin');
		const sameOrgNonOwner = await personaClient('repASales');

		const { data: connection, error: connectionErr } = await adminClient()
			.from('email_connections')
			.insert({
				profile_id: PERSONA_IDS.repAAdmin!,
				email_address: 'rls-probe@rls-test.threadline.local',
				access_token: 'rls-probe-access',
				refresh_token: 'rls-probe-refresh'
			})
			.select('id')
			.single();
		expect(connectionErr).toBeNull();
		const connectionId = (connection as { id: string }).id;
		try {
			await expectVisible(owner, 'email_connections', connectionId);
			await expectHidden(sameOrgNonOwner, 'email_connections', connectionId);
		} finally {
			await adminClient().from('email_connections').delete().eq('id', connectionId);
		}

		const { data: prefs, error: prefsErr } = await adminClient()
			.from('notification_preferences')
			.insert({ user_id: PERSONA_IDS.repAAdmin!, organization_id: RLS_IDS.orgRepA })
			.select('id')
			.single();
		expect(prefsErr).toBeNull();
		const prefsId = (prefs as { id: string }).id;
		try {
			await expectVisible(owner, 'notification_preferences', prefsId);
			await expectHidden(sameOrgNonOwner, 'notification_preferences', prefsId);
		} finally {
			await adminClient().from('notification_preferences').delete().eq('id', prefsId);
		}

		const { data: notification, error: notificationErr } = await adminClient()
			.from('notifications')
			.insert({
				organization_id: RLS_IDS.orgRepA,
				user_id: PERSONA_IDS.repAAdmin!,
				type: 'rls_probe',
				title: 'RLS Probe Notification'
			})
			.select('id')
			.single();
		expect(notificationErr).toBeNull();
		const notificationId = (notification as { id: string }).id;
		try {
			await expectVisible(owner, 'notifications', notificationId);
			await expectHidden(sameOrgNonOwner, 'notifications', notificationId);
		} finally {
			await adminClient().from('notifications').delete().eq('id', notificationId);
		}
	});
});
