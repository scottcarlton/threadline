import { describe, expect, it } from 'vitest';
import { saveLineEdits, type IncomingRow } from './save-line-edits.js';
import type { DiffOp } from '$lib/utils/order-line-diff.js';

type DbLineRow = {
	id: string;
	product_id: string;
	color: string | null;
	size: string | null;
	qty: number;
	original_qty: number | null;
	sort_order: number | null;
};

type RpcCall = {
	fn: string;
	params: { actor: string; order_id: string; ops: DiffOp[] };
};

type MockOptions = {
	initialLines?: DbLineRow[];
	selectError?: string;
	rpcError?: string;
	rpcResult?: { ok: boolean; applied: number; failed: number };
};

function makeSupabaseMock(opts: MockOptions = {}) {
	const rpcCalls: RpcCall[] = [];
	const selectCalls: Record<string, unknown>[] = [];

	return {
		rpcCalls,
		selectCalls,
		db: {
			from(table: string) {
				if (table !== 'order_lines') throw new Error(`Unexpected table: ${table}`);
				return {
					select(_cols: string) {
						void _cols;
						const filters: Record<string, unknown> = {};
						const builder = {
							eq(col: string, val: unknown) {
								filters[col] = val;
								return builder;
							},
							async is(col: string, val: unknown) {
								filters[col] = val;
								selectCalls.push({ ...filters });
								if (opts.selectError) {
									return { data: null, error: { message: opts.selectError } };
								}
								return { data: opts.initialLines ?? [], error: null };
							}
						};
						return builder;
					}
				};
			},
			async rpc(fn: string, params: { actor: string; order_id: string; ops: DiffOp[] }) {
				rpcCalls.push({ fn, params });
				if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
				const defaultResult = {
					ok: true,
					applied: params.ops.length,
					failed: 0
				};
				return { data: opts.rpcResult ?? defaultResult, error: null };
			}
		}
	};
}

function row(over: Partial<IncomingRow> = {}): IncomingRow {
	return {
		product_id: 'p1',
		color: 'Natural',
		color_edit: 'Natural',
		style_number: 'S-1',
		name: 'Shirt',
		unit_price: 100,
		qty_by_size: {},
		available_sizes: ['XS', 'S', 'M', 'L'],
		to_remove: false,
		...over
	};
}

const ACTOR = '00000000-0000-0000-0000-000000000aaa';
const ORDER = '00000000-0000-0000-0000-000000000001';

describe('saveLineEdits', () => {
	it('returns ok with 0 applied when the diff yields no ops', async () => {
		const mock = makeSupabaseMock({ initialLines: [] });
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: ORDER,
			actorId: ACTOR,
			rows: []
		});
		expect(res).toEqual({ ok: true, applied: 0, failed: 0, ops: [] });
		expect(mock.selectCalls).toHaveLength(1);
		expect(mock.rpcCalls).toHaveLength(0);
	});

	it('sends an insert op to apply_line_ops when a new size has qty > 0', async () => {
		const mock = makeSupabaseMock({ initialLines: [] });
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: ORDER,
			actorId: ACTOR,
			rows: [row({ qty_by_size: { M: 2 } })]
		});
		expect(res.ok).toBe(true);
		expect(mock.rpcCalls).toHaveLength(1);
		expect(mock.rpcCalls[0].fn).toBe('apply_line_ops');
		expect(mock.rpcCalls[0].params.actor).toBe(ACTOR);
		expect(mock.rpcCalls[0].params.order_id).toBe(ORDER);
		expect(mock.rpcCalls[0].params.ops).toEqual([
			{
				kind: 'insert',
				row: {
					product_id: 'p1',
					style_number: 'S-1',
					description: 'Shirt',
					color: 'Natural',
					size: 'M',
					qty: 2,
					unit_price: 100
				}
			}
		]);
	});

	it('sends an update op when an existing line qty changes', async () => {
		const mock = makeSupabaseMock({
			initialLines: [
				{
					id: 'l1',
					product_id: 'p1',
					color: 'Natural',
					size: 'M',
					qty: 1,
					original_qty: null,
					sort_order: 1
				}
			]
		});
		await saveLineEdits({
			supabase: mock.db,
			orderId: ORDER,
			actorId: ACTOR,
			rows: [row({ qty_by_size: { M: 3 } })]
		});
		expect(mock.rpcCalls[0].params.ops).toEqual([{ kind: 'update', id: 'l1', patch: { qty: 3 } }]);
	});

	it('sends a soft_remove op when existing qty goes to 0', async () => {
		const mock = makeSupabaseMock({
			initialLines: [
				{
					id: 'l1',
					product_id: 'p1',
					color: 'Natural',
					size: 'M',
					qty: 2,
					original_qty: null,
					sort_order: 1
				}
			]
		});
		await saveLineEdits({
			supabase: mock.db,
			orderId: ORDER,
			actorId: ACTOR,
			rows: [row({ qty_by_size: { M: 0 } })]
		});
		expect(mock.rpcCalls[0].params.ops).toEqual([{ kind: 'soft_remove', id: 'l1' }]);
	});

	it('sends soft_remove ops for every line on a to_remove row', async () => {
		const mock = makeSupabaseMock({
			initialLines: [
				{
					id: 'l1',
					product_id: 'p1',
					color: 'Natural',
					size: 'S',
					qty: 1,
					original_qty: null,
					sort_order: 1
				},
				{
					id: 'l2',
					product_id: 'p1',
					color: 'Natural',
					size: 'M',
					qty: 2,
					original_qty: null,
					sort_order: 2
				}
			]
		});
		await saveLineEdits({
			supabase: mock.db,
			orderId: ORDER,
			actorId: ACTOR,
			rows: [row({ to_remove: true })]
		});
		expect(mock.rpcCalls[0].params.ops).toEqual([
			{ kind: 'soft_remove', id: 'l1' },
			{ kind: 'soft_remove', id: 'l2' }
		]);
	});

	it('does not include DB lines whose (product, color) is absent from incoming rows', async () => {
		const mock = makeSupabaseMock({
			initialLines: [
				{
					id: 'untouched',
					product_id: 'p2',
					color: 'Black',
					size: 'M',
					qty: 3,
					original_qty: null,
					sort_order: 1
				}
			]
		});
		await saveLineEdits({
			supabase: mock.db,
			orderId: ORDER,
			actorId: ACTOR,
			rows: [row({ product_id: 'p1', qty_by_size: { S: 2 } })]
		});
		expect(mock.rpcCalls[0].params.ops).toEqual([
			{
				kind: 'insert',
				row: expect.objectContaining({ product_id: 'p1', size: 'S', qty: 2 })
			}
		]);
	});

	it('propagates RPC error into the result', async () => {
		const mock = makeSupabaseMock({
			initialLines: [],
			rpcError: 'apply_line_ops exploded'
		});
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: ORDER,
			actorId: ACTOR,
			rows: [row({ qty_by_size: { M: 1 } })]
		});
		expect(res.ok).toBe(false);
		expect(res.error).toBe('apply_line_ops exploded');
		expect(res.failed).toBe(1);
	});

	it('returns an error when the baseline fetch fails (no RPC call)', async () => {
		const mock = makeSupabaseMock({ selectError: 'permission denied' });
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: ORDER,
			actorId: ACTOR,
			rows: [row({ qty_by_size: { M: 1 } })]
		});
		expect(res.ok).toBe(false);
		expect(res.error).toBe('permission denied');
		expect(mock.rpcCalls).toHaveLength(0);
	});

	it('surfaces partial-failure counts reported by the RPC', async () => {
		const mock = makeSupabaseMock({
			initialLines: [],
			rpcResult: { ok: false, applied: 1, failed: 1 }
		});
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: ORDER,
			actorId: ACTOR,
			rows: [row({ qty_by_size: { S: 1, M: 2 } })]
		});
		expect(res.ok).toBe(false);
		expect(res.applied).toBe(1);
		expect(res.failed).toBe(1);
	});
});
