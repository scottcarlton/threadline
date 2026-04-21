import { describe, expect, it } from 'vitest';
import { saveLineEdits, type IncomingRow } from './save-line-edits.js';

type DbLineRow = {
	id: string;
	product_id: string;
	color: string | null;
	size: string | null;
	qty: number;
	original_qty: number | null;
	sort_order: number | null;
	removed_at?: string | null;
	removed_reason?: string | null;
};

type Op =
	| { kind: 'select'; filters: Record<string, unknown> }
	| { kind: 'insert'; row: Record<string, unknown> }
	| { kind: 'update'; id: string; patch: Record<string, unknown> };

type MockOptions = {
	initialLines?: DbLineRow[];
	selectError?: string;
	failInsertAt?: number; // zero-indexed across insert ops
	failUpdateAt?: number; // zero-indexed across update ops
};

/** Minimal Supabase mock tailored to the surface saveLineEdits touches. */
function makeSupabaseMock(opts: MockOptions = {}) {
	const ops: Op[] = [];
	let insertCounter = 0;
	let updateCounter = 0;

	return {
		ops,
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
								ops.push({ kind: 'select', filters: { ...filters } });
								if (opts.selectError) {
									return { data: null, error: { message: opts.selectError } };
								}
								return { data: opts.initialLines ?? [], error: null };
							}
						};
						return builder;
					},
					async insert(row: Record<string, unknown>) {
						ops.push({ kind: 'insert', row });
						const idx = insertCounter++;
						if (opts.failInsertAt === idx) {
							return { error: { message: `insert ${idx} failed` } };
						}
						return { error: null };
					},
					update(patch: Record<string, unknown>) {
						return {
							eq: async (col: string, val: unknown) => {
								if (col !== 'id') throw new Error(`Unexpected eq col: ${col}`);
								ops.push({ kind: 'update', id: String(val), patch });
								const idx = updateCounter++;
								if (opts.failUpdateAt === idx) {
									return { error: { message: `update ${idx} failed` } };
								}
								return { error: null };
							}
						};
					}
				};
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

const NOW = '2026-04-21T12:00:00.000Z';

describe('saveLineEdits', () => {
	it('returns ok with 0 applied when no rows produce ops', async () => {
		const mock = makeSupabaseMock({ initialLines: [] });
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [],
			now: () => NOW
		});
		expect(res).toEqual({ ok: true, applied: 0, failed: 0, ops: [] });
		// Still makes one select to establish baseline.
		expect(mock.ops.filter((o) => o.kind === 'select')).toHaveLength(1);
	});

	it('inserts a new (style, color, size) when qty > 0 and no existing line', async () => {
		const mock = makeSupabaseMock({ initialLines: [] });
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [row({ qty_by_size: { M: 2 } })],
			now: () => NOW
		});
		expect(res.ok).toBe(true);
		expect(res.applied).toBe(1);
		const inserts = mock.ops.filter((o) => o.kind === 'insert') as Array<{
			kind: 'insert';
			row: Record<string, unknown>;
		}>;
		expect(inserts).toHaveLength(1);
		expect(inserts[0].row).toMatchObject({
			order_id: 'o1',
			product_id: 'p1',
			style_number: 'S-1',
			description: 'Shirt',
			color: 'Natural',
			size: 'M',
			qty: 2,
			unit_price: 100,
			sort_order: 1
		});
	});

	it('assigns sort_order after the current max when inserting', async () => {
		const mock = makeSupabaseMock({
			initialLines: [
				{
					id: 'existing',
					product_id: 'p1',
					color: 'Natural',
					size: 'S',
					qty: 1,
					original_qty: null,
					sort_order: 7
				}
			]
		});
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [row({ qty_by_size: { S: 1, M: 3 } })],
			now: () => NOW
		});
		expect(res.ok).toBe(true);
		const inserts = mock.ops.filter((o) => o.kind === 'insert') as Array<{
			kind: 'insert';
			row: Record<string, unknown>;
		}>;
		expect(inserts).toHaveLength(1);
		expect(inserts[0].row.size).toBe('M');
		expect(inserts[0].row.sort_order).toBe(8);
	});

	it('updates qty on an existing line and snapshots original_qty when null', async () => {
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
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [row({ qty_by_size: { M: 3 } })],
			now: () => NOW
		});
		expect(res.ok).toBe(true);
		const updates = mock.ops.filter((o) => o.kind === 'update') as Array<{
			kind: 'update';
			id: string;
			patch: Record<string, unknown>;
		}>;
		expect(updates).toHaveLength(1);
		expect(updates[0]).toEqual({
			kind: 'update',
			id: 'l1',
			patch: { qty: 3, original_qty: 1 }
		});
	});

	it('leaves original_qty alone when it is already set', async () => {
		const mock = makeSupabaseMock({
			initialLines: [
				{
					id: 'l1',
					product_id: 'p1',
					color: 'Natural',
					size: 'M',
					qty: 2,
					original_qty: 1,
					sort_order: 1
				}
			]
		});
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [row({ qty_by_size: { M: 4 } })],
			now: () => NOW
		});
		expect(res.ok).toBe(true);
		const updates = mock.ops.filter((o) => o.kind === 'update') as Array<{
			kind: 'update';
			id: string;
			patch: Record<string, unknown>;
		}>;
		expect(updates).toHaveLength(1);
		expect(updates[0].patch).toEqual({ qty: 4 });
	});

	it('soft-removes an existing line when new qty is 0', async () => {
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
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [row({ qty_by_size: { M: 0 } })],
			now: () => NOW
		});
		expect(res.ok).toBe(true);
		const updates = mock.ops.filter((o) => o.kind === 'update') as Array<{
			kind: 'update';
			id: string;
			patch: Record<string, unknown>;
		}>;
		expect(updates).toHaveLength(1);
		expect(updates[0]).toEqual({
			kind: 'update',
			id: 'l1',
			patch: { removed_at: NOW, removed_reason: null }
		});
	});

	it('soft-removes every line on a row when to_remove is true', async () => {
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
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [row({ to_remove: true })],
			now: () => NOW
		});
		expect(res.ok).toBe(true);
		const updates = mock.ops.filter((o) => o.kind === 'update') as Array<{
			kind: 'update';
			id: string;
			patch: Record<string, unknown>;
		}>;
		expect(updates).toHaveLength(2);
		expect(updates.every((u) => u.patch.removed_at === NOW)).toBe(true);
	});

	it('does not touch DB lines whose (product, color) is not represented in incoming rows', async () => {
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
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [row({ product_id: 'p1', qty_by_size: { S: 2 } })],
			now: () => NOW
		});
		expect(res.ok).toBe(true);
		const updates = mock.ops.filter((o) => o.kind === 'update');
		expect(updates).toHaveLength(0);
		// Only the insert on p1 should happen.
		expect(mock.ops.filter((o) => o.kind === 'insert')).toHaveLength(1);
	});

	it('reports failure count when an op errors without aborting the rest', async () => {
		const mock = makeSupabaseMock({
			initialLines: [],
			failInsertAt: 0
		});
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [row({ qty_by_size: { S: 1, M: 2 } })],
			now: () => NOW
		});
		expect(res.ok).toBe(false);
		expect(res.failed).toBe(1);
		expect(res.applied).toBe(1);
		// Both inserts were attempted even though one failed.
		expect(mock.ops.filter((o) => o.kind === 'insert')).toHaveLength(2);
	});

	it('returns an error when the initial fetch fails', async () => {
		const mock = makeSupabaseMock({ selectError: 'permission denied' });
		const res = await saveLineEdits({
			supabase: mock.db,
			orderId: 'o1',
			rows: [row({ qty_by_size: { M: 1 } })],
			now: () => NOW
		});
		expect(res.ok).toBe(false);
		expect(res.error).toBe('permission denied');
		expect(mock.ops.filter((o) => o.kind !== 'select')).toHaveLength(0);
	});
});
