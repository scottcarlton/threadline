/**
 * The return state machine against a real database (SCO-186).
 *
 * Three claims worth proving here rather than in a unit test, because all three
 * are about what Postgres actually did:
 *
 *   1. RA numbering advances only on approval, so a declined or cancelled
 *      request leaves the issued series contiguous.
 *   2. Receipt restocks the right variants and, more importantly, leaves the
 *      wrong ones alone -- untracked and Shopify-mirrored.
 *   3. Restock and the status change are one transaction, so a refused receipt
 *      moves no stock at all.
 *
 * Service-role is used for setup only. Every transition runs as a persona,
 * because receive_return() authorizes its caller and service-role has no
 * identity for get_user_role() to resolve.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { loadPersonaIds, PERSONA_IDS, personaClient } from './setup/fixture.js';

const NAME_PREFIX = 'RLS Return Transitions Test';

const createdOrgIds: string[] = [];
let orgId: string;
let brandId: string;
let accountId: string;
let productId: string;
let stamp: number;

/** variant ids by the behaviour they are here to prove */
let variantTracked: string;
let variantUntracked: string;
let variantShopify: string;

async function makeReturn(
	lines: Array<{ variantId: string | null; qty: number }>,
	status = 'requested'
): Promise<string> {
	const admin = adminClient();
	const { data: ra, error } = await admin
		.from('return_authorizations')
		.insert({
			organization_id: orgId,
			brand_id: brandId,
			account_id: accountId,
			status,
			requested_by: PERSONA_IDS.brandAAdmin!,
			created_by: PERSONA_IDS.brandAAdmin!
		})
		.select('id')
		.single();
	if (error) throw new Error(`return insert failed: ${error.message}`);

	const { error: lineError } = await admin.from('return_lines').insert(
		lines.map((l, i) => ({
			return_id: ra.id,
			variant_id: l.variantId,
			style_number: `RT-${i}`,
			qty: l.qty,
			unit_price: 100,
			sort_order: i
		}))
	);
	if (lineError) throw new Error(`line insert failed: ${lineError.message}`);
	return ra.id as string;
}

async function lineIdsOf(returnId: string): Promise<string[]> {
	const { data } = await adminClient()
		.from('return_lines')
		.select('id')
		.eq('return_id', returnId)
		.order('sort_order');
	return (data ?? []).map((l) => (l as { id: string }).id);
}

async function stockOf(variantId: string): Promise<number | null> {
	const { data } = await adminClient()
		.from('product_variants')
		.select('stock_qty')
		.eq('id', variantId)
		.single();
	return (data as { stock_qty: number | null }).stock_qty;
}

async function raOf(returnId: string) {
	const { data } = await adminClient()
		.from('return_authorizations')
		.select('status, ra_number, approved_at, received_at, decline_reason')
		.eq('id', returnId)
		.single();
	return data!;
}

async function counterOf(): Promise<number> {
	const { data } = await adminClient()
		.from('organizations')
		.select('next_ra_number')
		.eq('id', orgId)
		.single();
	return (data as { next_ra_number: number }).next_ra_number;
}

beforeAll(async () => {
	await loadPersonaIds();
	const admin = adminClient();
	stamp = Date.now();

	const { data: org, error } = await admin
		.from('organizations')
		.insert({
			name: `${NAME_PREFIX} (brand)`,
			slug: `rtrans-${stamp}`,
			org_type: 'brand',
			order_number_prefix: `RLSRT${stamp}-`
		})
		.select('id')
		.single();
	if (error || !org) throw new Error(`org insert failed: ${error?.message}`);
	orgId = org.id as string;
	createdOrgIds.push(orgId);

	const { error: memberError } = await admin.from('organization_members').insert({
		organization_id: orgId,
		profile_id: PERSONA_IDS.brandAAdmin!,
		role: 'admin'
	});
	if (memberError) throw new Error(`membership failed: ${memberError.message}`);

	const { data: brand } = await admin
		.from('brands')
		.select('id')
		.eq('organization_id', orgId)
		.limit(1)
		.single();
	brandId = brand!.id as string;

	const { data: account } = await admin
		.from('accounts')
		.insert({ organization_id: orgId, business_name: `${NAME_PREFIX} Buyer` })
		.select('id')
		.single();
	accountId = account!.id as string;

	const { data: product, error: productError } = await admin
		.from('products')
		.insert({
			organization_id: orgId,
			brand_id: brandId,
			name: `${NAME_PREFIX} Product`,
			style_number: `RT-${stamp}`
		})
		.select('id')
		.single();
	if (productError) throw new Error(`product insert failed: ${productError.message}`);
	productId = product!.id as string;

	const mkVariant = async (label: string, fields: Record<string, unknown>): Promise<string> => {
		const { data, error: vError } = await admin
			.from('product_variants')
			.insert({ product_id: productId, color: label, size: 'M', ...fields })
			.select('id')
			.single();
		if (vError || !data) throw new Error(`variant ${label} failed: ${vError?.message}`);
		return data.id as string;
	};

	variantTracked = await mkVariant('Tracked', { stock_qty: 10 });
	// NULL stock_qty: "no signal yet" per 20260422000001.
	variantUntracked = await mkVariant('Untracked', { stock_qty: null });
	// Mirrored from Shopify: that migration forbids Threadline editing stock_qty.
	variantShopify = await mkVariant('Shopify', {
		stock_qty: 7,
		shopify_variant_id: `gid://shopify/ProductVariant/${stamp}`
	});
});

afterAll(async () => {
	const admin = adminClient();
	if (createdOrgIds.length > 0) {
		const { error } = await admin.from('organizations').delete().in('id', createdOrgIds);
		if (error) throw new Error(`return-transitions cleanup failed: ${error.message}`);
	}
	const { data: leaked } = await admin
		.from('organizations')
		.select('id')
		.like('name', `${NAME_PREFIX}%`);
	if ((leaked ?? []).length > 0) {
		throw new Error(`cleanup left ${(leaked ?? []).length} organization(s) behind`);
	}
});

describe('RA numbering', () => {
	it('numbers on approval, not on creation', async () => {
		const id = await makeReturn([{ variantId: variantTracked, qty: 1 }]);
		expect((await raOf(id)).ra_number).toBeNull();

		const client = await personaClient('brandAAdmin');
		await client.from('return_authorizations').update({ status: 'approved' }).eq('id', id);

		const ra = await raOf(id);
		expect(ra.ra_number).toMatch(/^RA-RTR-\d{5}$/);
		expect(ra.approved_at).not.toBeNull();
	});

	it('leaves the sequence unadvanced when a request is declined', async () => {
		// The whole reason numbering defers to approval: a declined request must
		// not burn a value and gap the issued series.
		const before = await counterOf();

		const declined = await makeReturn([{ variantId: variantTracked, qty: 1 }]);
		const client = await personaClient('brandAAdmin');
		await client
			.from('return_authorizations')
			.update({ status: 'declined', decline_reason: 'Outside the window' })
			.eq('id', declined);

		expect(await counterOf()).toBe(before);
		expect((await raOf(declined)).ra_number).toBeNull();

		// And the next approval takes the number the decline did not consume.
		const approved = await makeReturn([{ variantId: variantTracked, qty: 1 }]);
		await client.from('return_authorizations').update({ status: 'approved' }).eq('id', approved);

		const seq = Number((await raOf(approved)).ra_number!.split('-')[2]);
		expect(seq).toBe(before);
	});

	it('never renumbers a return that already has a number', async () => {
		// Cancelling an approved return must not release its number back, or the
		// series gaps from the other direction.
		const id = await makeReturn([{ variantId: variantTracked, qty: 1 }]);
		const client = await personaClient('brandAAdmin');
		await client.from('return_authorizations').update({ status: 'approved' }).eq('id', id);
		const first = (await raOf(id)).ra_number;

		await client.from('return_authorizations').update({ status: 'cancelled' }).eq('id', id);
		expect((await raOf(id)).ra_number).toBe(first);
	});
});

describe('receive_return', () => {
	async function approve(id: string) {
		const client = await personaClient('brandAAdmin');
		const { error } = await client
			.from('return_authorizations')
			.update({ status: 'approved' })
			.eq('id', id);
		if (error) throw new Error(`approve failed: ${error.message}`);
	}

	it('restocks a tracked variant and records the disposition', async () => {
		const id = await makeReturn([{ variantId: variantTracked, qty: 3 }]);
		await approve(id);
		const before = await stockOf(variantTracked);

		const [lineId] = await lineIdsOf(id);
		const client = await personaClient('brandAAdmin');
		const { error } = await client.rpc('receive_return', {
			p_return_id: id,
			p_dispositions: [{ lineId, disposition: 'restock' }]
		});
		if (error) throw new Error(`receive failed: ${error.message}`);

		expect(await stockOf(variantTracked)).toBe((before ?? 0) + 3);
		const ra = await raOf(id);
		expect(ra.status).toBe('received');
		expect(ra.received_at).not.toBeNull();
	});

	it('does not restock damaged goods', async () => {
		const id = await makeReturn([{ variantId: variantTracked, qty: 5 }]);
		await approve(id);
		const before = await stockOf(variantTracked);

		const [lineId] = await lineIdsOf(id);
		const client = await personaClient('brandAAdmin');
		await client.rpc('receive_return', {
			p_return_id: id,
			p_dispositions: [{ lineId, disposition: 'damaged' }]
		});

		expect(await stockOf(variantTracked)).toBe(before);
		expect((await raOf(id)).status).toBe('received');
	});

	it('leaves an untracked variant NULL rather than inventing a count', async () => {
		// NULL means "no signal yet". Writing the returned qty would invent
		// inventory tracking for an org that never opted in, and the first number
		// they ever saw would count only returns.
		const id = await makeReturn([{ variantId: variantUntracked, qty: 4 }]);
		await approve(id);

		const [lineId] = await lineIdsOf(id);
		const client = await personaClient('brandAAdmin');
		await client.rpc('receive_return', {
			p_return_id: id,
			p_dispositions: [{ lineId, disposition: 'restock' }]
		});

		expect(await stockOf(variantUntracked)).toBeNull();
		expect((await raOf(id)).status).toBe('received');
	});

	it('does not touch a Shopify-mirrored variant', async () => {
		// 20260422000001: "Threadline UI must not allow direct edits to stock_qty
		// when set." Shopify is the system of record; our write would be reverted
		// on the next sync and the two disagree until then.
		const id = await makeReturn([{ variantId: variantShopify, qty: 2 }]);
		await approve(id);
		const before = await stockOf(variantShopify);

		const [lineId] = await lineIdsOf(id);
		const client = await personaClient('brandAAdmin');
		await client.rpc('receive_return', {
			p_return_id: id,
			p_dispositions: [{ lineId, disposition: 'restock' }]
		});

		expect(await stockOf(variantShopify)).toBe(before);
		// Skipped for restock, but the disposition is still on file: the physical
		// decision was made and recorded either way.
		const { data: line } = await adminClient()
			.from('return_lines')
			.select('disposition')
			.eq('id', lineId)
			.single();
		expect((line as { disposition: string }).disposition).toBe('restock');
	});

	it('handles a free-entry line with no variant', async () => {
		const id = await makeReturn([{ variantId: null, qty: 2 }]);
		await approve(id);

		const [lineId] = await lineIdsOf(id);
		const client = await personaClient('brandAAdmin');
		const { error } = await client.rpc('receive_return', {
			p_return_id: id,
			p_dispositions: [{ lineId, disposition: 'restock' }]
		});
		expect(error).toBeNull();
		expect((await raOf(id)).status).toBe('received');
	});

	it('restocks only the eligible lines of a mixed return', async () => {
		const id = await makeReturn([
			{ variantId: variantTracked, qty: 2 },
			{ variantId: variantUntracked, qty: 2 },
			{ variantId: variantShopify, qty: 2 }
		]);
		await approve(id);
		const beforeTracked = await stockOf(variantTracked);
		const beforeShopify = await stockOf(variantShopify);

		const ids = await lineIdsOf(id);
		const client = await personaClient('brandAAdmin');
		await client.rpc('receive_return', {
			p_return_id: id,
			p_dispositions: ids.map((lineId) => ({ lineId, disposition: 'restock' }))
		});

		expect(await stockOf(variantTracked)).toBe((beforeTracked ?? 0) + 2);
		expect(await stockOf(variantUntracked)).toBeNull();
		expect(await stockOf(variantShopify)).toBe(beforeShopify);
	});

	it('moves no stock when a disposition is missing', async () => {
		// Atomicity: the refusal happens before any write, so a partial receipt
		// cannot leave stock that disagrees with the document explaining it.
		const id = await makeReturn([
			{ variantId: variantTracked, qty: 3 },
			{ variantId: variantTracked, qty: 3 }
		]);
		await approve(id);
		const before = await stockOf(variantTracked);

		const [first] = await lineIdsOf(id);
		const client = await personaClient('brandAAdmin');
		const { error } = await client.rpc('receive_return', {
			p_return_id: id,
			p_dispositions: [{ lineId: first, disposition: 'restock' }]
		});

		expect(error).not.toBeNull();
		expect(await stockOf(variantTracked)).toBe(before);
		expect((await raOf(id)).status).toBe('approved');
	});

	it('refuses a return that is not approved', async () => {
		const id = await makeReturn([{ variantId: variantTracked, qty: 1 }]);
		const [lineId] = await lineIdsOf(id);
		const client = await personaClient('brandAAdmin');
		const { error } = await client.rpc('receive_return', {
			p_return_id: id,
			p_dispositions: [{ lineId, disposition: 'restock' }]
		});
		expect(error).not.toBeNull();
	});

	it('refuses a caller outside the issuing org', async () => {
		// The NULL arm. get_user_role returns NULL for a non-member and
		// `NULL NOT IN (...)` is NULL rather than true, so a bare NOT IN would
		// wave every outsider through -- the hole SCO-189 found in void_invoice.
		const id = await makeReturn([{ variantId: variantTracked, qty: 1 }]);
		await approve(id);
		const before = await stockOf(variantTracked);

		const [lineId] = await lineIdsOf(id);
		const outsider = await personaClient('repAAdmin');
		const { error } = await outsider.rpc('receive_return', {
			p_return_id: id,
			p_dispositions: [{ lineId, disposition: 'restock' }]
		});

		// Assert the reason, not just that something failed: a missing grant or a
		// bad argument would also error, and would let this pass while the
		// NULL arm stayed broken.
		expect(error?.message).toContain('Only the issuing brand can receive a return');
		expect(await stockOf(variantTracked)).toBe(before);
		expect((await raOf(id)).status).toBe('approved');
	});

	it('refuses service-role, which has no identity to check', async () => {
		const id = await makeReturn([{ variantId: variantTracked, qty: 1 }]);
		await approve(id);
		const [lineId] = await lineIdsOf(id);
		const { error } = await adminClient().rpc('receive_return', {
			p_return_id: id,
			p_dispositions: [{ lineId, disposition: 'restock' }]
		});
		expect(error?.message).toContain('Only the issuing brand can receive a return');
	});

	it('is not executable by anon at the grant level', async () => {
		// The function body also rejects anon, which is why the next test would
		// pass either way. This pins the grant itself: on Supabase a bare
		// `REVOKE ... FROM PUBLIC` leaves anon's direct default-privilege grant in
		// place, and that mistake shipped once already (generate_ra_number).
		const { execFileSync } = await import('node:child_process');
		const { resolve } = await import('node:path');
		const out = execFileSync(
			resolve(process.cwd(), 'node_modules/.bin/supabase'),
			[
				'db',
				'query',
				"select has_function_privilege('anon', 'public.receive_return(uuid, jsonb)', 'EXECUTE') as anon_can",
				'--db-url',
				process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
				'-o',
				'json',
				'--agent=no'
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
		);
		expect(JSON.parse(out)[0].anon_can).toBe(false);
	});

	it('refuses anon', async () => {
		const { error } = await (await import('./setup/clients.js'))
			.anonClient()
			.rpc('receive_return', {
				p_return_id: '00000000-0000-4000-8000-000000000000',
				p_dispositions: []
			});
		expect(error).not.toBeNull();
	});
});
