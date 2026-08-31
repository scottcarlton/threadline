import { beforeAll, describe, expect, it } from 'vitest';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, personaClient } from './setup/fixture.js';
import { expectHidden, expectVisible } from './setup/assert.js';

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
