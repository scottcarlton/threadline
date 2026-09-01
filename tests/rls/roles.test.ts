import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { MEMBER_ROW_IDS, PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import {
	expectHidden,
	expectInsertDenied,
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

	it('a scoped member cannot grant themselves more brands', async () => {
		const scoped = await personaClient('brandAMember');
		await expectInsertDenied(scoped, 'member_brand_access', {
			member_id: MEMBER_ROW_IDS.brandAMember,
			brand_id: RLS_IDS.brandA2,
			granted_by: PERSONA_IDS.brandAMember
		});
	});
});

describe('manager rollup', () => {
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
