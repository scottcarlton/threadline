import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { MEMBER_ROW_IDS, PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import {
	expectHidden,
	expectInsertAllowed,
	expectInsertDenied,
	expectUpdateAllowed,
	expectUpdateDenied,
	expectVisible
} from './setup/assert.js';

beforeAll(loadPersonaIds);

// A.3: seasons, shows, source_types, territories INSERT is admin/owner only.
const ADMIN_ONLY_TABLES = ['seasons', 'shows', 'source_types', 'territories'] as const;

describe('role gradient on admin-only tables', () => {
	it('admin can insert into admin-only tables', async () => {
		const brandAAdmin = await personaClient('brandAAdmin');
		for (const table of ADMIN_ONLY_TABLES) {
			const { data, error } = await brandAAdmin
				.from(table)
				.insert({ organization_id: RLS_IDS.orgBrandA, name: `RLS role probe ${table}` })
				.select('id')
				.single();
			expect(error, `${table} insert as admin`).toBeNull();
			await adminClient()
				.from(table)
				.delete()
				.eq('id', (data as { id: string }).id);
		}
	});

	it('sales cannot insert into admin-only tables', async () => {
		const brandASales = await personaClient('brandASales');
		for (const table of ADMIN_ONLY_TABLES) {
			await expectInsertDenied(brandASales, table, {
				organization_id: RLS_IDS.orgBrandA,
				name: `RLS role probe ${table}`
			});
		}
	});

	it('guest cannot insert into admin-only tables', async () => {
		const brandAGuest = await personaClient('brandAGuest');
		for (const table of ADMIN_ONLY_TABLES) {
			await expectInsertDenied(brandAGuest, table, {
				organization_id: RLS_IDS.orgBrandA,
				name: `RLS role probe ${table}`
			});
		}
	});

	it('sales can insert an appointment (A.3 allows admin/owner/member/sales)', async () => {
		const brandASales = await personaClient('brandASales');
		const { data, error } = await brandASales
			.from('appointments')
			.insert({
				organization_id: RLS_IDS.orgBrandA,
				notes: 'RLS sales appointment',
				created_by: PERSONA_IDS.brandASales
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		await adminClient()
			.from('appointments')
			.delete()
			.eq('id', (data as { id: string }).id);
	});
});

describe('privilege escalation is denied', () => {
	it("positive control: an admin can update a report's organization_members row", async () => {
		// Without this, every denial test below would pass identically in a
		// broken world where NO real (non-service-role) user can write to
		// organization_members at all -- a missing GRANT to authenticated, a
		// stale PostgREST schema cache, or trg_validate_org_member_manager
		// rejecting more than intended. This proves the door is open for the
		// role the policy says should have it, so the denials below mean
		// something. Restoration in `finally` is unconditional: leaving
		// brandASales promoted would corrupt every later run of this suite
		// and silently weaken the escalation tests that follow.
		const brandAAdmin = await personaClient('brandAAdmin');
		try {
			await expectUpdateAllowed(brandAAdmin, 'organization_members', MEMBER_ROW_IDS.brandASales!, {
				role: 'member'
			});
		} finally {
			await adminClient()
				.from('organization_members')
				.update({ role: 'sales' })
				.eq('id', MEMBER_ROW_IDS.brandASales!);
		}
	});

	it('a non-admin cannot promote themselves', async () => {
		const brandASales = await personaClient('brandASales');
		const { data, error } = await brandASales
			.from('organization_members')
			.update({ role: 'admin' })
			.eq('profile_id', PERSONA_IDS.brandASales!)
			.select('id');
		if (error) {
			expect(error.code).toBe('42501');
		} else {
			expect(data ?? [], 'role self-escalation must affect no rows').toEqual([]);
		}
	});

	it('a non-admin cannot add themselves to another org', async () => {
		const brandASales = await personaClient('brandASales');
		await expectInsertDenied(brandASales, 'organization_members', {
			organization_id: RLS_IDS.orgRepA,
			profile_id: PERSONA_IDS.brandASales,
			role: 'admin'
		});
	});
});

describe('member_brand_access scoping', () => {
	it('a scoped member sees only the granted brand', async () => {
		const scoped = await personaClient('brandAMember');
		await expectVisible(scoped, 'brands', RLS_IDS.brandA1);
		await expectHidden(scoped, 'brands', RLS_IDS.brandA2);
	});

	it('an unscoped admin in the same org sees both brands', async () => {
		const brandAAdmin = await personaClient('brandAAdmin');
		await expectVisible(brandAAdmin, 'brands', RLS_IDS.brandA1);
		await expectVisible(brandAAdmin, 'brands', RLS_IDS.brandA2);
	});

	it('positive control: an admin can grant a member access to another brand', async () => {
		// Without this, the denial test below would pass identically in a
		// broken world where NO real (non-service-role) user can insert into
		// member_brand_access at all -- the only other inserts into this
		// table go through the service role in fixture setup, which bypasses
		// RLS entirely. This proves the door is open for the role the policy
		// says should have it (an admin granting access), so the denial
		// below means something. Restoration in `finally` is unconditional.
		const brandAAdmin = await personaClient('brandAAdmin');
		let grantId: string | undefined;
		try {
			grantId = await expectInsertAllowed(brandAAdmin, 'member_brand_access', {
				member_id: MEMBER_ROW_IDS.brandAMember,
				brand_id: RLS_IDS.brandA2,
				granted_by: PERSONA_IDS.brandAAdmin
			});
		} finally {
			if (grantId) {
				await adminClient().from('member_brand_access').delete().eq('id', grantId);
			}
		}
	});

	it('a scoped member cannot grant themselves more brands', async () => {
		const scoped = await personaClient('brandAMember');
		await expectInsertDenied(scoped, 'member_brand_access', {
			member_id: MEMBER_ROW_IDS.brandAMember,
			brand_id: RLS_IDS.brandA2,
			granted_by: PERSONA_IDS.brandAMember
		});
	});
});

describe('organization-wide visibility across a manager and report relationship', () => {
	// These assertions characterize plain org-wide RLS, not the manager-rollup
	// helpers. The organization_members SELECT policy is
	// `organization_id IN (SELECT get_user_org_ids())` and the orders SELECT
	// policy is org/brand scoped -- neither is manager-subtree scoped, so any
	// org member sees a report's member row and orders under the same
	// policies, manager or not. get_managed_member_ids() and
	// get_managed_profile_ids() are used in application-layer query filters
	// (sales rollup `created_by IN (...)` filters), not in any RLS policy, so
	// they are out of scope for this RLS suite and need their own unit tests
	// elsewhere.
	it('a manager sees the organization_members row for their report', async () => {
		const repAAdmin = await personaClient('repAAdmin');
		await expectVisible(repAAdmin, 'organization_members', MEMBER_ROW_IDS.repASales!);
	});

	it('a report cannot update their manager role', async () => {
		const repASales = await personaClient('repASales');
		await expectUpdateDenied(repASales, 'organization_members', MEMBER_ROW_IDS.repAAdmin!, {
			role: 'admin'
		});
	});

	it('an order created by a report is visible to their manager, hidden from an outsider', async () => {
		const admin = adminClient();
		const { data, error } = await admin
			.from('orders')
			.insert({
				organization_id: RLS_IDS.orgRepA,
				brand_id: RLS_IDS.brandRepAOwn,
				freeform_name: 'RLS manager rollup probe buyer',
				created_by: PERSONA_IDS.repASales,
				status: 'draft'
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		const orderId = (data as { id: string }).id;

		try {
			const repAAdmin = await personaClient('repAAdmin');
			const repBAdmin = await personaClient('repBAdmin');
			await expectVisible(repAAdmin, 'orders', orderId);
			await expectHidden(repBAdmin, 'orders', orderId);
		} finally {
			await admin.from('orders').delete().eq('id', orderId);
		}
	});

	it('an outsider does not see the report member row either', async () => {
		const repBAdmin = await personaClient('repBAdmin');
		await expectHidden(repBAdmin, 'organization_members', MEMBER_ROW_IDS.repASales!);
	});
});
