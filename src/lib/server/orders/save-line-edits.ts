// Server-side save for order-line edits. The client-side flow in
// src/routes/orders/[id]/+page.svelte historically ran Supabase mutations
// directly from the browser, one network round-trip per op. This helper
// centralizes the logic on the server so we can add status gating, get
// atomicity, and — critically — attribute audits to the actual acting user
// (not whoever created the order).
//
// The implementation delegates the actual DB work to the `apply_line_ops`
// Postgres function (see supabase/migrations/20260421000005_apply_line_ops.sql),
// which runs all ops in one transaction after seeding `app.acting_user` so the
// line-audit trigger attributes correctly even under service-role (supabaseAdmin)
// calls — whose auth.uid() is NULL.

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
type SelectBuilder = {
	eq(column: string, value: unknown): SelectBuilder;
	is(column: string, value: unknown): PromiseLike<SelectOk>;
};
type OrderLinesTable = {
	select(columns: string): SelectBuilder;
};

export type ApplyLineOpsRpcResult = {
	ok: boolean;
	applied: number;
	failed: number;
	errors?: Array<{ op: unknown; message: string }>;
};
type RpcOk = {
	data: ApplyLineOpsRpcResult | null;
	error: { message: string } | null;
};

export type SupabaseForLineEdits = {
	from(table: 'order_lines'): OrderLinesTable;
	rpc(
		fn: 'apply_line_ops',
		params: { actor: string; order_id: string; ops: DiffOp[] }
	): PromiseLike<RpcOk>;
};

export type SaveLineEditsInput = {
	supabase: SupabaseForLineEdits;
	orderId: string;
	/** UUID of the user performing the edit. Seeded into the Postgres
	 * transaction so the line-audit trigger records it as the actor. */
	actorId: string;
	rows: IncomingRow[];
};

export type SaveLineEditsResult = {
	ok: boolean;
	applied: number;
	failed: number;
	ops: DiffOp[];
	error?: string;
};

/**
 * Compute the diff between the client's desired row state and the order's
 * current non-removed order_lines, then apply the ops via the
 * `apply_line_ops` RPC (single transaction, acting-user attributed).
 */
export async function saveLineEdits({
	supabase,
	orderId,
	actorId,
	rows
}: SaveLineEditsInput): Promise<SaveLineEditsResult> {
	// 1. Fetch current non-removed order_lines. We need qty + original_qty for
	//    the client-side diff; apply_line_ops re-reads qty on update to set
	//    original_qty correctly in the same transaction.
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
	//    incoming row based on (product_id, color). Anything in dbLines not
	//    represented in `rows` is left untouched — matching the existing
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

	// 3. Compute ops using the shared diff helper. Same logic runs on client
	//    (for delta-chip previews) and here (for authoritative apply).
	const ops = diffLineEdits(drafts);

	if (ops.length === 0) {
		return { ok: true, applied: 0, failed: 0, ops: [] };
	}

	// 4. One RPC call applies everything in a single transaction.
	const { data: rpcData, error: rpcErr } = await supabase.rpc('apply_line_ops', {
		actor: actorId,
		order_id: orderId,
		ops
	});

	if (rpcErr) {
		return { ok: false, applied: 0, failed: ops.length, ops, error: rpcErr.message };
	}
	const result = rpcData ?? { ok: false, applied: 0, failed: ops.length };

	return {
		ok: result.ok,
		applied: result.applied,
		failed: result.failed,
		ops
	};
}
