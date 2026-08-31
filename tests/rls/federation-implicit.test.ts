import { beforeAll, describe, expect, it } from 'vitest';
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

	it('federation is not transitive', async () => {
		// Brand B has no connection to Rep A, so nothing of Rep A reaches it
		// through Brand A.
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(brandB, 'brands', RLS_IDS.brandRepAOwn);
		await expectHidden(brandB, 'accounts', RLS_IDS.accountRepA);
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
