/**
 * SCO-208: the offline snapshot's catalog runs through the caller's RLS
 * client. Brand ids come from the order pickers' scope; RLS is the second gate,
 * so a brand id outside the caller's reach returns nothing.
 */
import { describe, expect, it } from 'vitest';
import { RLS_IDS } from './setup/ids.js';
import { personaClient } from './setup/fixture.js';
import { loadCatalog } from '../../src/lib/server/products/catalog.js';

describe('offline catalog', () => {
	it('returns a connected brand catalog for a rep', async () => {
		const products = await loadCatalog(await personaClient('repAAdmin'), [RLS_IDS.brandA1]);
		expect(products.map((p) => p.id)).toContain(RLS_IDS.productA1);
		expect(products.every((p) => p.brand_id === RLS_IDS.brandA1)).toBe(true);
	});

	it('returns nothing for a brand the rep is not connected to, even if asked', async () => {
		const products = await loadCatalog(await personaClient('repAAdmin'), [RLS_IDS.brandB1]);
		expect(products).toEqual([]);
	});
});
