/**
 * Submit-time authorization for the shared order action (SCO-203).
 *
 * submitOrder writes through the service role, so RLS never sees the insert.
 * These tests run the real reference lookups against the fixture database and
 * pin that a rep's payload can only name rows the order pickers would have
 * offered, and that prices come from `products`, not the client.
 *
 * Scope is built by hand to match what resolveOrderScope returns for repAAdmin
 * (repA is connected to brandA only). resolveOrderScope itself needs the
 * SvelteKit env, so its org_connections logic is covered by being shared with
 * loadOrderPrereqs rather than here.
 */
import { describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import {
	checkSubmitReferences,
	collectReferencedIds,
	fetchSubmitReferences
} from '../../src/lib/server/orders/authorize-submit.js';
import type { OrderScope } from '../../src/lib/server/orders/order-scope.js';
import type { SubmitPayload } from '../../src/lib/schemas/order-submit.js';

const repAScope: OrderScope = {
	ownOrgIds: [RLS_IDS.orgRepA],
	visibleOrgIds: [RLS_IDS.orgRepA, RLS_IDS.orgBrandA],
	repVisibleOrgIds: [RLS_IDS.orgRepA, RLS_IDS.orgBrandA],
	connectedBrandOrgIds: new Set([RLS_IDS.orgBrandA]),
	connectedRepOrgIds: new Set(),
	isBuyer: false,
	buyerAccountIds: null,
	buyerBrandIds: null,
	isBrandOrg: false
};

const ctx = { userId: '00000000-0000-4000-8000-0000000000aa', orgId: RLS_IDS.orgRepA };

const payload = (over: Partial<SubmitPayload> = {}): SubmitPayload => ({
	type: 'order',
	account_id: RLS_IDS.accountBrandA,
	freeform_name: null,
	order_year: 2026,
	submitStatus: 'draft',
	payment_preference: null,
	lines: [
		{
			product_id: RLS_IDS.productA1,
			brand_id: RLS_IDS.brandA1,
			season_id: null,
			color: 'Black',
			size: 'M',
			qty: 2,
			// Tampered: the client claims a price the product does not have.
			unit_price: 0.01
		}
	],
	groups: [{ brand_id: RLS_IDS.brandA1, season_id: null, delivery: null, location_id: null }],
	finalize: null,
	...over
});

async function authorize(p: SubmitPayload) {
	const refs = await fetchSubmitReferences(adminClient(), collectReferencedIds(p), repAScope);
	return checkSubmitReferences(p, refs, repAScope, ctx);
}

describe('submit authorization against the fixture', () => {
	it('accepts a connected brand product for a connected brand account', async () => {
		const res = await authorize(payload());
		expect(res.ok).toBe(true);
	});

	it('prices from products.wholesale_price, ignoring the client price', async () => {
		const { data } = await adminClient()
			.from('products')
			.select('wholesale_price')
			.eq('id', RLS_IDS.productA1)
			.single();
		const res = await authorize(payload());
		expect(res.ok).toBe(true);
		if (res.ok) {
			const price = Number(res.products.get(RLS_IDS.productA1)?.wholesale_price);
			expect(price).toBe(Number(data?.wholesale_price));
			expect(price).not.toBe(0.01);
		}
	});

	it('rejects an account owned by an unconnected brand org', async () => {
		const res = await authorize(payload({ account_id: RLS_IDS.accountBrandB }));
		expect(res).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects a product and brand from an unconnected brand org', async () => {
		const res = await authorize(
			payload({
				lines: [
					{ ...payload().lines[0], product_id: RLS_IDS.productB1, brand_id: RLS_IDS.brandB1 }
				],
				groups: [{ brand_id: RLS_IDS.brandB1, season_id: null, delivery: null, location_id: null }]
			})
		);
		expect(res).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects a foreign product smuggled under an allowed brand', async () => {
		const res = await authorize(
			payload({ lines: [{ ...payload().lines[0], product_id: RLS_IDS.productB1 }] })
		);
		expect(res).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects ids that do not exist at all', async () => {
		const res = await authorize(payload({ account_id: '0f500000-0000-4000-8000-00000000ffff' }));
		expect(res).toMatchObject({ ok: false, status: 403 });
	});
});
