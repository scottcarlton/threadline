/**
 * SCO-204: create_order_submission writes an inline account, every order and
 * every line of one submission in a single transaction, keyed by client ids.
 *
 * It is SECURITY DEFINER and service-role only (pinned in definer-grants),
 * called by submitOrder through supabaseAdmin after the payload has been
 * authorized (SCO-203). These tests call it the same way, as the service role,
 * with fixture rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, PERSONA_IDS } from './setup/fixture.js';

const orderIds: string[] = [];
const accountIds: string[] = [];

beforeAll(loadPersonaIds);

afterAll(async () => {
	const admin = adminClient();
	if (orderIds.length) {
		await admin.from('order_lines').delete().in('order_id', orderIds);
		await admin.from('orders').delete().in('id', orderIds);
	}
	if (accountIds.length) await admin.from('accounts').delete().in('id', accountIds);
});

function order(over: Record<string, unknown> = {}) {
	const id = randomUUID();
	orderIds.push(id);
	return {
		id,
		organization_id: RLS_IDS.orgRepA,
		order_type: 'order',
		account_id: RLS_IDS.accountBrandA,
		brand_id: RLS_IDS.brandA1,
		status: 'draft',
		total_amount: 20,
		channel: 'web-rep',
		lines: [
			{
				product_id: RLS_IDS.productA1,
				style_number: 'ST-1',
				description: 'Tee',
				color: 'Black',
				size: 'M',
				qty: 2,
				unit_price: 10,
				sort_order: 0
			}
		],
		...over
	};
}

type Written = { order_id: string; order_number: string; inserted: boolean };

async function submit(orders: unknown[], account: unknown = null, actor = PERSONA_IDS.repAAdmin) {
	const { data, error } = await adminClient().rpc('create_order_submission', {
		p_actor: actor,
		p_account: account,
		p_orders: orders
	});
	return { data: data as Written[] | null, error };
}

async function counts(ids: string[]) {
	const admin = adminClient();
	const [o, l] = await Promise.all([
		admin.from('orders').select('id').in('id', ids),
		admin.from('order_lines').select('id').in('order_id', ids)
	]);
	return { orders: o.data?.length ?? 0, lines: l.data?.length ?? 0 };
}

describe('create_order_submission', () => {
	it('writes every order and line, assigning order numbers', async () => {
		const a = order();
		const b = order({ brand_id: RLS_IDS.brandA1, season_id: null });
		const { data, error } = await submit([a, b]);
		expect(error).toBeNull();
		expect(data?.map((r) => [r.order_id, r.inserted])).toEqual([
			[a.id, true],
			[b.id, true]
		]);
		expect(data?.every((r) => r.order_number.length > 0)).toBe(true);
		expect(await counts([a.id, b.id])).toEqual({ orders: 2, lines: 2 });

		const { data: row } = await adminClient()
			.from('orders')
			.select('created_by')
			.eq('id', a.id)
			.single();
		expect(row?.created_by).toBe(PERSONA_IDS.repAAdmin);
	});

	it('replays a known submission without writing or burning an order number', async () => {
		const a = order();
		const first = await submit([a]);
		const firstNumber = first.data?.[0].order_number;

		const { data, error } = await submit([a]);
		expect(error).toBeNull();
		expect(data).toEqual([{ order_id: a.id, order_number: firstNumber, inserted: false }]);
		expect(await counts([a.id])).toEqual({ orders: 1, lines: 1 });

		// The next real order takes the very next number: the replay above did
		// not advance the counter.
		const next = order();
		const after = await submit([next]);
		const seq = (n: string) => Number(n.match(/(\d+)$/)?.[1]);
		expect(seq(after.data![0].order_number)).toBe(seq(firstNumber!) + 1);
	});

	it('rolls back the whole submission when a later order fails', async () => {
		const ok = order();
		// qty is NOT NULL on order_lines, so the second order's lines fail after
		// the first order and its lines are already written.
		const bad = order({ lines: [{ product_id: RLS_IDS.productA1, style_number: 'X', qty: null }] });
		const { error } = await submit([ok, bad]);
		expect(error).not.toBeNull();
		expect(await counts([ok.id, bad.id])).toEqual({ orders: 0, lines: 0 });
	});

	it('creates the inline account in the same transaction', async () => {
		const accountId = randomUUID();
		accountIds.push(accountId);
		const account = {
			id: accountId,
			organization_id: RLS_IDS.orgRepA,
			business_name: 'SCO-204 Freeform'
		};

		const bad = order({ account_id: accountId, lines: [{ qty: null }] });
		await submit([bad], account);
		const none = await adminClient().from('accounts').select('id').eq('id', accountId);
		expect(none.data).toEqual([]);

		const good = order({ account_id: accountId });
		const { error } = await submit([good], account);
		expect(error).toBeNull();
		const one = await adminClient().from('accounts').select('id').eq('id', accountId);
		expect(one.data).toHaveLength(1);

		// Replaying the same account id is fine; nothing new is written.
		const again = await submit([good], account);
		expect(again.error).toBeNull();
		expect(again.data?.[0].inserted).toBe(false);
	});

	it('refuses an order id that belongs to another org', async () => {
		const a = order();
		await submit([a]);
		const { data, error } = await submit([{ ...a, organization_id: RLS_IDS.orgRepB }]);
		expect(data).toBeNull();
		expect(error?.code).toBe('23505');
	});

	it('refuses an order id created by another user, even in the same org', async () => {
		const a = order();
		await submit([a]);
		const { data, error } = await submit([a], null, PERSONA_IDS.repASales);
		expect(data).toBeNull();
		expect(error?.code).toBe('23505');
	});

	it('refuses an account id that belongs to another org', async () => {
		const { error } = await submit([order()], {
			id: RLS_IDS.accountBrandB,
			organization_id: RLS_IDS.orgRepA,
			business_name: 'Hijack'
		});
		expect(error?.code).toBe('23505');
	});
});
