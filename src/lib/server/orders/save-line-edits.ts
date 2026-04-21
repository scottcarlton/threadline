// Server-side save for order-line edits. The client-side flow in
// src/routes/orders/[id]/+page.svelte historically ran Supabase mutations
// directly from the browser, one network round-trip per op. This helper
// centralizes the same logic server-side so we can add status gating, keep
// audit semantics consistent, and later wrap the whole thing in a Postgres
// transaction for atomicity.
//
// For now the helper applies ops sequentially using whichever Supabase client
// is passed in (server-side code should pass `supabaseAdmin`, since the
// @supabase/ssr client drops its JWT on writes per feedback_supabase_ssr_auth_bug).
// Sequential application is still a meaningful improvement over the client-side
// loop because all policy decisions and audit emissions happen in one place.

import {
	diffLineEdits,
	type DiffOp,
	type DraftRowInput,
	type ExistingLine
} from '$lib/utils/order-line-diff.js';

export type IncomingRow = Omit<DraftRowInput, 'lines'>;

type DbLineRow = ExistingLine & { original_qty: number | null; sort_order: number | null };

// Narrow structural interface — `SupabaseClient` satisfies this (postgrest's
// builders are PromiseLike, not full Promise), and so does a plain object mock
// in tests. Avoids depending on the full PostgrestQueryBuilder surface just to
// call a few methods.
type SelectOk = { data: DbLineRow[] | null; error: { message: string } | null };
type WriteOk = { error: { message: string } | null };
type SelectBuilder = {
	eq(column: string, value: unknown): SelectBuilder;
	is(column: string, value: unknown): PromiseLike<SelectOk>;
};
type UpdateBuilder = {
	eq(column: string, value: unknown): PromiseLike<WriteOk>;
};
type OrderLinesTable = {
	select(columns: string): SelectBuilder;
	insert(row: Record<string, unknown>): PromiseLike<WriteOk>;
	update(patch: Record<string, unknown>): UpdateBuilder;
};
export type SupabaseForLineEdits = {
	from(table: 'order_lines'): OrderLinesTable;
};

export type SaveLineEditsInput = {
	supabase: SupabaseForLineEdits;
	orderId: string;
	rows: IncomingRow[];
	/** Override for `new Date().toISOString()` — injected in tests. */
	now?: () => string;
};

export type SaveLineEditsResult = {
	ok: boolean;
	applied: number;
	failed: number;
	ops: DiffOp[];
	error?: string;
};

/**
 * Compute and apply the diff between a client-supplied desired row state and
 * the order's current (non-removed) order_lines.
 *
 * The caller owns:
 *  - Authentication / authorization (org membership + status gating).
 *  - Choice of Supabase client (pass `supabaseAdmin` server-side).
 *
 * Returns `applied` (ops that succeeded), `failed` (ops that errored), and the
 * full list of ops in case the caller wants to emit an audit entry.
 */
export async function saveLineEdits({
	supabase,
	orderId,
	rows,
	now = () => new Date().toISOString()
}: SaveLineEditsInput): Promise<SaveLineEditsResult> {
	// 1. Fetch current non-removed order_lines for this order. We need qty +
	//    original_qty to preserve "first-edit snapshots" and sort_order so new
	//    inserts land at the end.
	const { data: dbData, error: fetchErr } = await supabase
		.from('order_lines')
		.select('id, product_id, color, size, qty, original_qty, sort_order')
		.eq('order_id', orderId)
		.is('removed_at', null);

	if (fetchErr) {
		return { ok: false, applied: 0, failed: 0, ops: [], error: fetchErr.message };
	}
	const dbLines: DbLineRow[] = dbData ?? [];

	// 2. Reconstruct DraftRowInput[] by attaching matching DB lines to each
	//    incoming row based on (product_id, color). Anything in dbLines that
	//    isn't represented in `rows` is left untouched — matching the existing
	//    draft-based contract.
	const drafts: DraftRowInput[] = rows.map((row) => ({
		...row,
		lines: dbLines
			.filter((l) => l.product_id === row.product_id && (l.color ?? null) === row.color)
			.map(
				(l): ExistingLine => ({
					id: l.id,
					product_id: l.product_id,
					color: l.color,
					size: l.size,
					qty: l.qty
				})
			)
	}));

	// 3. Compute ops using the battle-tested client helper. Same diff logic runs
	//    on both sides so behavior matches exactly.
	const ops = diffLineEdits(drafts);

	if (ops.length === 0) {
		return { ok: true, applied: 0, failed: 0, ops: [] };
	}

	// 4. Apply ops sequentially. New inserts get sort_order after the current
	//    max so the ordering is stable even when the client reconstructs rows.
	const maxSort = dbLines.reduce((m, l) => Math.max(m, l.sort_order ?? 0), 0);
	let nextSort = maxSort;
	let failed = 0;
	const removedAt = now();

	for (const op of ops) {
		if (op.kind === 'insert') {
			nextSort++;
			const { error: insertErr } = await supabase.from('order_lines').insert({
				order_id: orderId,
				...op.row,
				sort_order: nextSort
			});
			if (insertErr) failed++;
		} else if (op.kind === 'update') {
			// Preserve original_qty: snapshot the previous qty the first time a
			// line's qty changes. Matches the pattern in src/lib/server/ai-tools.ts.
			const current = dbLines.find((l) => l.id === op.id);
			const patch: Record<string, unknown> = { ...op.patch };
			if (op.patch.qty !== undefined && current && current.original_qty === null) {
				patch.original_qty = current.qty;
			}
			const { error: updErr } = await supabase.from('order_lines').update(patch).eq('id', op.id);
			if (updErr) failed++;
		} else if (op.kind === 'soft_remove') {
			const { error: rmErr } = await supabase
				.from('order_lines')
				.update({ removed_at: removedAt, removed_reason: null })
				.eq('id', op.id);
			if (rmErr) failed++;
		}
	}

	return {
		ok: failed === 0,
		applied: ops.length - failed,
		failed,
		ops
	};
}
