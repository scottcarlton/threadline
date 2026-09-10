import { afterAll, beforeAll, describe, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { MEMBER_ROW_IDS, PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import {
	expectDeleteAllowed,
	expectDeleteAllowedByFilter,
	expectDeleteDenied,
	expectDeleteDeniedByFilter,
	expectHidden,
	expectHiddenByFilter,
	expectInsertAllowed,
	expectInsertAllowedNoId,
	expectInsertDenied,
	expectUpdateAllowed,
	expectUpdateAllowedByFilter,
	expectUpdateDenied,
	expectUpdateDeniedByFilter,
	expectVisible,
	expectVisibleByFilter
} from './setup/assert.js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ai_requests and messaging_verification_attempts are unreachable one
 * layer below RLS: they carry no GRANT to `authenticated` at all, so
 * Postgres refuses the query before RLS is even evaluated, raising the
 * same 42501 code visibleByFilter treats as an unexpected error for
 * ordinary RLS-guarded tables. beta_whitelist, messaging_sessions, and
 * messaging_messages DO carry the standard grants, so their denial is
 * pure RLS (empty result set, no error) -- confirmed against
 * information_schema.role_table_grants for all five tables. Both
 * mechanisms make a table unreachable to authenticated roles; this
 * helper accepts either as "hidden" for that reason.
 */
async function expectUnreachableByFilter(
	client: SupabaseClient,
	table: string,
	filter: Record<string, unknown>
): Promise<void> {
	let query = client.from(table).select('*');
	for (const [column, value] of Object.entries(filter)) {
		query = query.eq(column, value);
	}
	const { data, error } = await query;
	if (error) {
		if (error.code !== '42501') {
			throw new Error(`${table}: unexpected select error ${error.code}: ${error.message}`);
		}
		return;
	}
	if ((data ?? []).length !== 0) {
		throw new Error(`${table}: expected no rows visible, got ${(data ?? []).length}`);
	}
}

/**
 * Write (INSERT/UPDATE/DELETE) coverage for the 12 tables this suite had
 * never touched, plus the write side of three brand-scoped settings tables
 * whose SELECT policies are already exercised elsewhere. Every policy text
 * quoted in the comments below was read live via:
 *
 *   docker exec supabase_db_threadline psql -U postgres -d postgres -c \
 *     "select polname, polcmd, pg_get_expr(polqual,polrelid) as using_expr, \
 *      pg_get_expr(polwithcheck,polrelid) as check_expr from pg_policy \
 *      where polrelid='public.<table>'::regclass;"
 *
 * These are characterization tests. Policies are correct until proven
 * otherwise: a failing test means the setup or the expectation is wrong,
 * not the policy, unless the module comments say otherwise.
 */

beforeAll(loadPersonaIds);

// ---------------------------------------------------------------------
// Section A: the two tamper-evidence guarantees
// ---------------------------------------------------------------------

describe('order_audits has no write policy of any kind: tamper-evident by absence', () => {
	// pg_policy for public.order_audits carries exactly one row, a SELECT:
	//
	//   "Users can view audits for accessible orders" FOR SELECT
	//   USING (
	//     order_id IN (SELECT orders.id FROM orders WHERE orders.organization_id
	//       IN (SELECT organization_id FROM organization_members
	//           WHERE profile_id = auth.uid()))
	//     OR order_id IN (SELECT federated_order_links.order_id
	//       FROM federated_order_links WHERE target_org_id IN
	//           (SELECT get_user_org_ids()) AND status = 'active')
	//   )
	//
	// There is no INSERT, UPDATE, or DELETE policy at all -- not even for
	// admins. That is the audit trail's whole point: nothing short of the
	// service role can rewrite history. If a future migration adds a write
	// policy here, this test must change deliberately for it to keep
	// passing.
	let auditId: string;

	beforeAll(async () => {
		const { data, error } = await adminClient()
			.from('order_audits')
			.insert({
				order_id: RLS_IDS.orderRepAOnBrandA,
				actor_id: PERSONA_IDS.repAAdmin!,
				event_type: 'status_changed',
				field: 'status',
				before_value: { status: 'draft' },
				after_value: { status: 'submitted' }
			})
			.select('id')
			.single();
		if (error) throw new Error(`order_audits probe insert failed: ${error.message}`);
		auditId = (data as { id: string }).id;
	});

	afterAll(async () => {
		if (!auditId) return;
		await adminClient().from('order_audits').delete().eq('id', auditId);
	});

	it('a fully privileged org admin cannot insert a forged audit row', async () => {
		const repA = await personaClient('repAAdmin');
		await expectInsertDenied(repA, 'order_audits', {
			order_id: RLS_IDS.orderRepAOnBrandA,
			actor_id: PERSONA_IDS.repAAdmin!,
			event_type: 'order_created'
		});
	});

	it('a fully privileged org admin cannot update an existing audit row', async () => {
		const repA = await personaClient('repAAdmin');
		await expectUpdateDenied(repA, 'order_audits', auditId, {
			after_value: { status: 'cancelled' }
		});
		// The row must still be exactly what it was, not silently rewritten.
		await expectVisible(repA, 'order_audits', auditId);
	});

	it('a fully privileged org admin cannot delete an existing audit row', async () => {
		const repA = await personaClient('repAAdmin');
		await expectDeleteDenied(repA, 'order_audits', auditId);
		await expectVisible(repA, 'order_audits', auditId);
	});

	it('the owning org can read the audit for its own order', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'order_audits', auditId);
	});

	it('the federated brand (target org of the active link) can read it too', async () => {
		// orderRepAOnBrandA is organization_id=orgRepA, brand_id=brandA1
		// (owned by orgBrandA). auto_federate_order() creates a
		// federated_order_links row with source_org_id=orgRepA,
		// target_org_id=orgBrandA at order insert time, in the fixture.
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'order_audits', auditId);
	});

	it('an unrelated org sees neither the owning-org nor the federated-brand audit', async () => {
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(brandB, 'order_audits', auditId);
	});
});

describe('email_intakes has no INSERT and no DELETE policy, but is genuinely reachable via UPDATE', () => {
	// pg_policy for public.email_intakes:
	//
	//   "org_members_read_intakes" FOR SELECT
	//   USING (organization_id IN (SELECT organization_id FROM
	//     organization_members WHERE profile_id = auth.uid()))
	//
	//   "org_members_update_intakes" FOR UPDATE
	//   USING (organization_id IN (SELECT organization_id FROM
	//     organization_members om WHERE om.profile_id = auth.uid() AND
	//     om.role IN ('admin','owner','member','sales')))
	//
	// No INSERT policy and no DELETE policy exist at all. Email intake rows
	// can only be created and destroyed by the service-role ingestion
	// pipeline; every human-facing role, including org admin, can only
	// update one that already exists. If a future migration adds an INSERT
	// or DELETE policy, this test must change deliberately for it to keep
	// passing.
	let intakeId: string;

	beforeAll(async () => {
		const { data, error } = await adminClient()
			.from('email_intakes')
			.insert({
				organization_id: RLS_IDS.orgBrandA,
				from_email: 'rls-write-probe-sender@rls-test.threadline.local',
				to_email: 'rls-write-probe-recipient@rls-test.threadline.local',
				subject: 'RLS write probe intake',
				message_id: 'rls-write-probe-message-id',
				provider_email_id: 'rls-write-probe-provider-id',
				status: 'received'
			})
			.select('id')
			.single();
		if (error) throw new Error(`email_intakes probe insert failed: ${error.message}`);
		intakeId = (data as { id: string }).id;
	});

	afterAll(async () => {
		if (!intakeId) return;
		await adminClient().from('email_intakes').delete().eq('id', intakeId);
	});

	it('an org admin cannot create an email intake row', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectInsertDenied(brandA, 'email_intakes', {
			organization_id: RLS_IDS.orgBrandA,
			from_email: 'rls-write-probe-forged@rls-test.threadline.local',
			to_email: 'rls-write-probe-forged-to@rls-test.threadline.local',
			message_id: 'rls-write-probe-forged-message-id',
			provider_email_id: 'rls-write-probe-forged-provider-id'
		});
	});

	it('an org admin cannot delete an email intake row', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectDeleteDenied(brandA, 'email_intakes', intakeId);
		await expectVisible(brandA, 'email_intakes', intakeId);
	});

	it('an admin/owner/member/sales role CAN update one -- proving the table is reachable at all', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectUpdateAllowed(brandA, 'email_intakes', intakeId, {
			subject: 'RLS write probe intake (updated)'
		});
	});
});

// ---------------------------------------------------------------------
// Section B + C: brand-scoped settings tables -- write gradient and
// federation SELECT
// ---------------------------------------------------------------------

type BrandScopedProbe = {
	table: string;
	/** tag disambiguates rows sharing a unique constraint (brand_sales_tax_rates' (brand_id, state_code)) */
	row: (tag: string) => Record<string, unknown>;
	patch: Record<string, unknown>;
};

const brandScopedProbes: BrandScopedProbe[] = [
	{
		table: 'brand_terms',
		// is_current: false sidesteps brand_terms_one_current_per_brand
		// (a partial unique index on brand_id WHERE is_current), so
		// multiple probe rows for the same brand can coexist.
		row: (tag) => ({
			brand_id: RLS_IDS.brandA1,
			organization_id: RLS_IDS.orgBrandA,
			title: `RLS write probe terms ${tag}`,
			body: 'Probe terms body',
			is_current: false
		}),
		patch: { title: 'RLS write probe terms (updated)' }
	},
	{
		table: 'brand_sales_tax_rates',
		row: (tag) => ({
			brand_id: RLS_IDS.brandA1,
			state_code: `RP${tag}`,
			rate: 7.25,
			tax_type: 'destination'
		}),
		patch: { rate: 8.5 }
	},
	{
		table: 'brand_shipping_methods',
		row: (tag) => ({
			brand_id: RLS_IDS.brandA1,
			name: `RLS write probe shipping ${tag}`,
			cost_type: 'flat',
			cost_amount: 10
		}),
		patch: { cost_amount: 20 }
	}
];

async function insertViaAdmin(table: string, row: Record<string, unknown>): Promise<string> {
	const { data, error } = await adminClient().from(table).insert(row).select('id').single();
	if (error) {
		throw new Error(`probe insert for ${table} failed: ${error.code} ${error.message}`);
	}
	return (data as { id: string }).id;
}

describe.each(brandScopedProbes)(
	'$table: write gradient (admin/owner only, brand-scoped via brands join)',
	(probe) => {
		let seededId: string;

		beforeAll(async () => {
			seededId = await insertViaAdmin(probe.table, probe.row('seed'));
		});

		afterAll(async () => {
			if (!seededId) return;
			await adminClient().from(probe.table).delete().eq('id', seededId);
		});

		it('brandAAdmin can insert, update, and delete', async () => {
			const brandA = await personaClient('brandAAdmin');
			const newId = await expectInsertAllowed(brandA, probe.table, probe.row('admin-crud'));
			await expectUpdateAllowed(brandA, probe.table, newId, probe.patch);
			await expectDeleteAllowed(brandA, probe.table, newId);
		});

		// brandASales: sales role is excluded, admin/owner only.
		// brandAGuest: guest role is excluded.
		// repBAdmin: outsider org, no connection at all.
		it.each(['brandASales', 'brandAGuest', 'repBAdmin'] as const)(
			'%s cannot insert, update, or delete',
			async (persona) => {
				const client = await personaClient(persona);
				await expectInsertDenied(client, probe.table, probe.row(`${persona}-insert`));
				await expectUpdateDenied(client, probe.table, seededId, probe.patch);
				await expectDeleteDenied(client, probe.table, seededId);
				// The seeded row must survive every denied attempt.
				await expectVisible(await personaClient('brandAAdmin'), probe.table, seededId);
			}
		);
	}
);

describe.each(brandScopedProbes)(
	'$table: federation SELECT distinguishes active from pending connections',
	(probe) => {
		let seededId: string;

		beforeAll(async () => {
			seededId = await insertViaAdmin(probe.table, probe.row('federation-select'));
		});

		afterAll(async () => {
			if (!seededId) return;
			await adminClient().from(probe.table).delete().eq('id', seededId);
		});

		it('repAAdmin (active connection to Brand A) can read the row', async () => {
			const repA = await personaClient('repAAdmin');
			await expectVisible(repA, probe.table, seededId);
		});

		it('repBAdmin (pending connection to Brand A) cannot read the row', async () => {
			const repB = await personaClient('repBAdmin');
			await expectHidden(repB, probe.table, seededId);
		});
	}
);

// ---------------------------------------------------------------------
// Section D: org_setup_status and email_intake_line_resolutions
// ---------------------------------------------------------------------

describe('org_setup_status: FOR ALL scoped to own org, USING reused for INSERT', () => {
	// pg_policy for public.org_setup_status:
	//
	//   "org_setup_status_all" FOR ALL
	//   USING (organization_id IN (SELECT organization_id FROM
	//     organization_members WHERE profile_id = auth.uid()))
	//   -- no explicit WITH CHECK, so Postgres reuses the USING clause for
	//   -- INSERT/UPDATE/DELETE as well as read visibility inside the ALL
	//   -- policy.
	//
	//   "org_setup_status_select" FOR SELECT
	//   USING (organization_id IN (SELECT organization_id FROM
	//     organization_members WHERE profile_id = auth.uid()))
	//
	// Both policies are own-org only, no federation clause. A member of
	// another org can't even attempt to write a row scoped to organization
	// ids that pass the USING check, because those checks reference the
	// row's own organization_id, not the caller's -- an outsider inserting
	// a row with someone else's organization_id fails at exactly the same
	// clause a same-org member's insert passes.
	afterAll(async () => {
		await adminClient()
			.from('org_setup_status')
			.delete()
			.eq('organization_id', RLS_IDS.orgBrandA)
			.eq('section', 'rls-write-probe-section');
	});

	it('brandAAdmin can insert a setup-status row for their own org', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectInsertAllowedNoId(brandA, 'org_setup_status', {
			organization_id: RLS_IDS.orgBrandA,
			section: 'rls-write-probe-section',
			status: 'pending'
		});
	});

	it('brandAAdmin can update their own org setup-status row', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectUpdateAllowedByFilter(
			brandA,
			'org_setup_status',
			{ organization_id: RLS_IDS.orgBrandA, section: 'rls-write-probe-section' },
			{ status: 'complete' }
		);
	});

	it('repBAdmin (a different org) cannot see the row at all', async () => {
		const repB = await personaClient('repBAdmin');
		await expectHiddenByFilter(repB, 'org_setup_status', {
			organization_id: RLS_IDS.orgBrandA,
			section: 'rls-write-probe-section'
		});
	});

	it('repBAdmin cannot update the row', async () => {
		const repB = await personaClient('repBAdmin');
		await expectUpdateDeniedByFilter(
			repB,
			'org_setup_status',
			{ organization_id: RLS_IDS.orgBrandA, section: 'rls-write-probe-section' },
			{ status: 'complete' }
		);
	});

	it('repBAdmin cannot insert a row impersonating Brand A org', async () => {
		const repB = await personaClient('repBAdmin');
		try {
			await expectInsertDenied(repB, 'org_setup_status', {
				organization_id: RLS_IDS.orgBrandA,
				section: 'rls-write-probe-impersonation',
				status: 'pending'
			});
		} finally {
			// Tolerate the row existing if the denial assertion above ever
			// fails (which would itself be the finding): don't leak it.
			await adminClient()
				.from('org_setup_status')
				.delete()
				.eq('organization_id', RLS_IDS.orgBrandA)
				.eq('section', 'rls-write-probe-impersonation');
		}
	});

	it('brandAAdmin can delete their own org setup-status row', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectDeleteAllowedByFilter(brandA, 'org_setup_status', {
			organization_id: RLS_IDS.orgBrandA,
			section: 'rls-write-probe-section'
		});
	});
});

describe('email_intake_line_resolutions: read-only via org membership, no write policy at all', () => {
	// pg_policy for public.email_intake_line_resolutions carries exactly
	// one row:
	//
	//   "org_members_read_line_resolutions" FOR SELECT
	//   USING (intake_id IN (SELECT ei.id FROM email_intakes ei WHERE
	//     ei.organization_id IN (SELECT organization_id FROM
	//     organization_members WHERE profile_id = auth.uid())))
	//
	// No INSERT, UPDATE, or DELETE policy. Line resolutions are written
	// only by the AI parsing pipeline via the service role; every human
	// role, including org admin, is read-only here. If a future migration
	// adds a write policy, this test must change deliberately for it to
	// keep passing.
	let intakeId: string;
	let resolutionId: string;

	beforeAll(async () => {
		const admin = adminClient();
		const { data: intake, error: intakeErr } = await admin
			.from('email_intakes')
			.insert({
				organization_id: RLS_IDS.orgBrandA,
				from_email: 'rls-line-resolution-probe-sender@rls-test.threadline.local',
				to_email: 'rls-line-resolution-probe-recipient@rls-test.threadline.local',
				message_id: 'rls-line-resolution-probe-message-id',
				provider_email_id: 'rls-line-resolution-probe-provider-id'
			})
			.select('id')
			.single();
		if (intakeErr) throw new Error(`intake for line resolution probe failed: ${intakeErr.message}`);
		intakeId = (intake as { id: string }).id;

		const { data: resolution, error: resolutionErr } = await admin
			.from('email_intake_line_resolutions')
			.insert({
				intake_id: intakeId,
				line_index: 0,
				raw_text: 'RLS line resolution probe raw text'
			})
			.select('id')
			.single();
		if (resolutionErr) {
			throw new Error(`line resolution probe insert failed: ${resolutionErr.message}`);
		}
		resolutionId = (resolution as { id: string }).id;
	});

	afterAll(async () => {
		if (intakeId) {
			// Cascades email_intake_line_resolutions.
			await adminClient().from('email_intakes').delete().eq('id', intakeId);
		}
	});

	it('an org member can read the line resolution', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'email_intake_line_resolutions', resolutionId);
	});

	it('an outsider org cannot read the line resolution', async () => {
		const repB = await personaClient('repBAdmin');
		await expectHidden(repB, 'email_intake_line_resolutions', resolutionId);
	});

	it('an org member cannot insert a line resolution', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectInsertDenied(brandA, 'email_intake_line_resolutions', {
			intake_id: intakeId,
			line_index: 1,
			raw_text: 'RLS forged line resolution'
		});
	});

	it('an org member cannot update a line resolution', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectUpdateDenied(brandA, 'email_intake_line_resolutions', resolutionId, {
			raw_text: 'RLS forged update'
		});
	});

	it('an org member cannot delete a line resolution', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectDeleteDenied(brandA, 'email_intake_line_resolutions', resolutionId);
	});
});

// ---------------------------------------------------------------------
// Section E: zero-policy tables -- unreachable to any RLS-subject role
// ---------------------------------------------------------------------

describe('zero-policy tables: unreachable to any role subject to RLS', () => {
	// ai_requests, beta_whitelist, messaging_messages, messaging_sessions,
	// and messaging_verification_attempts all have RLS enabled and zero
	// policies of any kind:
	//
	//   docker exec supabase_db_threadline psql -U postgres -d postgres -t -A -c \
	//     "select relname from pg_class c where c.relname in \
	//      ('ai_requests','beta_whitelist','messaging_messages', \
	//       'messaging_sessions','messaging_verification_attempts') \
	//      and c.relrowsecurity and not exists \
	//      (select 1 from pg_policy p where p.polrelid = c.oid);"
	//
	// returns all five. With RLS enabled and no policy, Postgres denies
	// every row to every role except the table owner / service role -- not
	// "no rows match", but "no policy grants access at all". These look
	// like deliberate backend-only telemetry (AI usage counters, a beta
	// invite allowlist, and SMS/WhatsApp messaging transcripts written by
	// server-side webhook handlers), but nothing in the codebase documents
	// that this is intentional rather than an oversight. This test pins
	// the observed behavior; it does not bless it as correct.
	//
	// Each row is seeded with the service-role client first so the read
	// denial is meaningful rather than an empty table.
	let sessionId: string;

	beforeAll(async () => {
		const admin = adminClient();

		const { data: session, error: sessionErr } = await admin
			.from('messaging_sessions')
			.insert({
				profile_id: PERSONA_IDS.brandAAdmin!,
				organization_id: RLS_IDS.orgBrandA,
				phone_number: '+15550001111',
				channel: 'sms',
				status: 'active'
			})
			.select('id')
			.single();
		if (sessionErr)
			throw new Error(`messaging_sessions probe insert failed: ${sessionErr.message}`);
		sessionId = (session as { id: string }).id;

		const inserts: Array<[string, Record<string, unknown>]> = [
			[
				'ai_requests',
				{
					organization_id: RLS_IDS.orgBrandA,
					user_id: PERSONA_IDS.brandAAdmin!,
					endpoint: 'rls-write-probe'
				}
			],
			[
				'beta_whitelist',
				{
					email: 'rls-zero-policy-probe@rls-test.threadline.local',
					invited_by: PERSONA_IDS.brandAAdmin!
				}
			],
			[
				'messaging_messages',
				{
					session_id: sessionId,
					direction: 'inbound',
					body: 'RLS zero-policy probe message'
				}
			],
			[
				'messaging_verification_attempts',
				{
					phone_number: '+15550002222',
					attempts: 1
				}
			]
		];
		for (const [table, row] of inserts) {
			const { error } = await admin.from(table).insert(row);
			if (error) throw new Error(`${table} probe insert failed: ${error.message}`);
		}
	});

	afterAll(async () => {
		const admin = adminClient();
		await admin
			.from('ai_requests')
			.delete()
			.eq('organization_id', RLS_IDS.orgBrandA)
			.eq('endpoint', 'rls-write-probe');
		await admin
			.from('beta_whitelist')
			.delete()
			.eq('email', 'rls-zero-policy-probe@rls-test.threadline.local');
		await admin.from('messaging_verification_attempts').delete().eq('phone_number', '+15550002222');
		// messaging_messages cascades from messaging_sessions.
		if (sessionId) {
			await admin.from('messaging_sessions').delete().eq('id', sessionId);
		}
	});

	it.each([
		['ai_requests', { organization_id: RLS_IDS.orgBrandA, endpoint: 'rls-write-probe' }],
		['beta_whitelist', { email: 'rls-zero-policy-probe@rls-test.threadline.local' }],
		['messaging_verification_attempts', { phone_number: '+15550002222' }]
	] as const)(
		'%s: an authenticated org admin can neither read nor insert',
		async (table, filter) => {
			const brandA = await personaClient('brandAAdmin');
			await expectUnreachableByFilter(brandA, table, filter);
			try {
				await expectInsertDenied(brandA, table, filter);
			} finally {
				await adminClient()
					.from(table)
					.delete()
					.match(filter as Record<string, unknown>);
			}
		}
	);

	it('messaging_sessions: an authenticated org admin can neither read nor insert', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectHidden(brandA, 'messaging_sessions', sessionId);
		const forgedRow = {
			profile_id: PERSONA_IDS.brandAAdmin!,
			organization_id: RLS_IDS.orgBrandA,
			phone_number: '+15550003333',
			channel: 'sms'
		};
		try {
			await expectInsertDenied(brandA, 'messaging_sessions', forgedRow);
		} finally {
			await adminClient()
				.from('messaging_sessions')
				.delete()
				.eq('phone_number', forgedRow.phone_number);
		}
	});

	it('messaging_messages: an authenticated org admin can neither read nor insert', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectHiddenByFilter(brandA, 'messaging_messages', { session_id: sessionId });
		const forgedRow = {
			session_id: sessionId,
			direction: 'inbound',
			body: 'RLS forged message'
		};
		try {
			await expectInsertDenied(brandA, 'messaging_messages', forgedRow);
		} finally {
			await adminClient()
				.from('messaging_messages')
				.delete()
				.eq('session_id', sessionId)
				.eq('body', forgedRow.body);
		}
	});
});

// ---------------------------------------------------------------------
// Stretch: keyless tables addressed via composite primary keys
// ---------------------------------------------------------------------

describe('member_territories: composite PK (organization_member_id, territory_id), admin/owner only', () => {
	// pg_policy for public.member_territories:
	//
	//   "Admin/owner can insert member territories" FOR INSERT
	//   WITH CHECK (territory_id IN (SELECT territories.id FROM territories
	//     WHERE get_user_role(territories.organization_id) IN
	//     ('admin','owner')))
	//
	//   "Admin/owner can delete member territories" FOR DELETE
	//   USING (same shape)
	//
	//   "Member territories visible to either side" FOR SELECT
	//   USING (territory_id IN (SELECT territories.id FROM territories WHERE
	//     is_org_member(territories.organization_id)) OR
	//     organization_member_id IN (SELECT organization_members.id FROM
	//     organization_members WHERE is_org_member(organization_members.organization_id)))
	//
	// No UPDATE policy exists at all -- there's nothing to update on a pure
	// join row, so this section only covers INSERT/DELETE/SELECT.
	let territoryId: string;

	beforeAll(async () => {
		const { data, error } = await adminClient()
			.from('territories')
			.insert({ organization_id: RLS_IDS.orgRepA, name: 'RLS write probe territory' })
			.select('id')
			.single();
		if (error) throw new Error(`territory probe insert failed: ${error.message}`);
		territoryId = (data as { id: string }).id;
	});

	afterAll(async () => {
		if (!territoryId) return;
		// Cascades member_territories.
		await adminClient().from('territories').delete().eq('id', territoryId);
	});

	it('repAAdmin (admin/owner) can insert and delete a member-territory assignment', async () => {
		const repA = await personaClient('repAAdmin');
		const filter = {
			organization_member_id: MEMBER_ROW_IDS.repASales!,
			territory_id: territoryId
		};
		await expectInsertAllowedNoId(repA, 'member_territories', filter);
		await expectVisibleByFilter(repA, 'member_territories', filter);
		await expectDeleteAllowedByFilter(repA, 'member_territories', filter);
	});

	it('repASales (non-admin) cannot insert a member-territory assignment', async () => {
		const repASales = await personaClient('repASales');
		await expectInsertDenied(repASales, 'member_territories', {
			organization_member_id: MEMBER_ROW_IDS.repASales!,
			territory_id: territoryId
		});
	});

	it('repBAdmin (outsider org) cannot insert or delete a member-territory assignment', async () => {
		const admin = adminClient();
		const filter = {
			organization_member_id: MEMBER_ROW_IDS.repASales!,
			territory_id: territoryId
		};
		const { error: seedErr } = await admin.from('member_territories').insert(filter);
		if (seedErr)
			throw new Error(`member_territories seed for outsider test failed: ${seedErr.message}`);
		try {
			const repB = await personaClient('repBAdmin');
			await expectInsertDenied(repB, 'member_territories', {
				organization_member_id: MEMBER_ROW_IDS.repBAdmin!,
				territory_id: territoryId
			});
			await expectDeleteDeniedByFilter(repB, 'member_territories', filter);
		} finally {
			await admin
				.from('member_territories')
				.delete()
				.eq('organization_member_id', filter.organization_member_id)
				.eq('territory_id', filter.territory_id);
		}
	});
});

describe('order_views: composite PK (order_id, profile_id), profile-scoped only', () => {
	// pg_policy for public.order_views:
	//
	//   "Users mark their own views" FOR INSERT WITH CHECK (profile_id = auth.uid())
	//   "Users read their own views" FOR SELECT USING (profile_id = auth.uid())
	//   "Users update their own views" FOR UPDATE USING (profile_id = auth.uid())
	//
	// Scoped purely by profile identity, with no order-visibility or
	// org-membership clause at all -- unlike every table above. There is
	// also no DELETE policy, so once a view is marked, even its own owner
	// can never remove it through RLS. Both of those are read directly off
	// the live policy, not assumed.
	//
	// PERSONA_IDS.repASales is only populated once loadPersonaIds resolves
	// in the top-level beforeAll, so it cannot be read at describe-body
	// collection time -- every reference below is inside a hook or test
	// body, which runs after that beforeAll.
	afterAll(async () => {
		await adminClient()
			.from('order_views')
			.delete()
			.eq('order_id', RLS_IDS.orderRepAOnBrandA)
			.eq('profile_id', PERSONA_IDS.repASales!);
	});

	it('repASales can mark their own view of an order', async () => {
		const repASales = await personaClient('repASales');
		const ownFilter = {
			order_id: RLS_IDS.orderRepAOnBrandA,
			profile_id: PERSONA_IDS.repASales!
		};
		await expectInsertAllowedNoId(repASales, 'order_views', ownFilter);
		await expectVisibleByFilter(repASales, 'order_views', ownFilter);
	});

	it('repASales can update their own view row', async () => {
		const repASales = await personaClient('repASales');
		await expectUpdateAllowedByFilter(
			repASales,
			'order_views',
			{ order_id: RLS_IDS.orderRepAOnBrandA, profile_id: PERSONA_IDS.repASales! },
			{ viewed_at: new Date().toISOString() }
		);
	});

	it('a different org member (repAAdmin) cannot see or update repASales view row', async () => {
		const repAAdmin = await personaClient('repAAdmin');
		const filter = { order_id: RLS_IDS.orderRepAOnBrandA, profile_id: PERSONA_IDS.repASales! };
		await expectHiddenByFilter(repAAdmin, 'order_views', filter);
		await expectUpdateDeniedByFilter(repAAdmin, 'order_views', filter, {
			viewed_at: new Date().toISOString()
		});
	});

	it('there is no DELETE policy: even the owning profile cannot delete their own view', async () => {
		const repASales = await personaClient('repASales');
		await expectDeleteDeniedByFilter(repASales, 'order_views', {
			order_id: RLS_IDS.orderRepAOnBrandA,
			profile_id: PERSONA_IDS.repASales!
		});
		await expectVisibleByFilter(repASales, 'order_views', {
			order_id: RLS_IDS.orderRepAOnBrandA,
			profile_id: PERSONA_IDS.repASales!
		});
	});
});
