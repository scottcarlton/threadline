import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findMinimumViolations, blockingViolations } from './order-minimum';
import type { BrandCommerceSettings } from './resolve-order-settings';

function settingsFor(
	brandId: string,
	ownerOrgId: string,
	amount: number | null
): BrandCommerceSettings {
	return {
		brand_id: brandId,
		owner_org_id: ownerOrgId,
		order_minimum_enabled: amount !== null,
		order_minimum_amount: amount
	} as BrandCommerceSettings;
}

// Minimal stand-in for the two lookups the helper makes.
function fakeClient(tables: Record<string, Array<Record<string, unknown>>>): SupabaseClient {
	return {
		from(table: string) {
			return {
				select() {
					return {
						in(_col: string, ids: string[]) {
							const rows = (tables[table] ?? []).filter((r) => ids.includes(r.id as string));
							return Promise.resolve({ data: rows, error: null });
						}
					};
				}
			};
		}
	} as unknown as SupabaseClient;
}

const client = fakeClient({
	brands: [{ id: 'b1', name: 'Acme' }],
	accounts: [
		{ id: 'own-acct', organization_id: 'brand-org', order_minimum_override: 100 },
		{ id: 'rep-acct', organization_id: 'rep-org', order_minimum_override: 0 }
	]
});
const settings = new Map([['b1', settingsFor('b1', 'brand-org', 500)]]);

describe('findMinimumViolations', () => {
	it('blocks a rep under the minimum, naming the brand', async () => {
		const v = await findMinimumViolations(
			client,
			[{ brand_id: 'b1', account_id: 'rep-acct', total_amount: 380 }],
			'rep-org',
			settings
		);
		expect(v).toHaveLength(1);
		expect(v[0]).toMatchObject({ shortfall: 120, minimum: 500, canOverride: false });
		expect(v[0].message).toContain("Acme's $500.00 minimum");
		expect(blockingViolations(v)).toHaveLength(1);
	});

	it('lets the brand override its own minimum', async () => {
		const v = await findMinimumViolations(
			client,
			[{ brand_id: 'b1', account_id: 'rep-acct', total_amount: '380.00' }],
			'brand-org',
			settings
		);
		expect(v[0].canOverride).toBe(true);
		expect(blockingViolations(v)).toHaveLength(0);
	});

	it('never lets a null actor (a buyer) override', async () => {
		const v = await findMinimumViolations(
			client,
			[{ brand_id: 'b1', account_id: null, total_amount: 10 }],
			null,
			settings
		);
		expect(blockingViolations(v)).toHaveLength(1);
	});

	it("honors the brand's own account override", async () => {
		const v = await findMinimumViolations(
			client,
			[{ brand_id: 'b1', account_id: 'own-acct', total_amount: 150 }],
			'rep-org',
			settings
		);
		expect(v).toHaveLength(0);
	});

	it('passes orders at or over the minimum and brands with none', async () => {
		const v = await findMinimumViolations(
			client,
			[
				{ brand_id: 'b1', account_id: null, total_amount: 500 },
				{ brand_id: 'b2', account_id: null, total_amount: 1 }
			],
			'rep-org',
			new Map([...settings, ['b2', settingsFor('b2', 'other-org', null)]])
		);
		expect(v).toHaveLength(0);
	});

	it('reports the index of each failing order', async () => {
		const v = await findMinimumViolations(
			client,
			[
				{ brand_id: 'b1', account_id: null, total_amount: 900 },
				{ brand_id: 'b1', account_id: null, total_amount: 10 }
			],
			'rep-org',
			settings
		);
		expect(v.map((x) => x.index)).toEqual([1]);
	});
});
