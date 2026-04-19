// Pure diff between an in-memory edit of grouped Line rows (one row per
// (product_id, color)) and the server's order_lines. Runs on Save Items in
// the order detail page. Kept free of Supabase/Svelte imports so it's easy to
// test in isolation.

export type ExistingLine = {
	id: string;
	product_id: string | null;
	color: string | null;
	size: string | null;
	qty: number;
};

export type DraftRowInput = {
	/** Stable key: for rows that came from activeLines this is the (product_id, color) of the source. */
	product_id: string;
	color: string | null;
	/** New color after edits — if differs from `color`, all the row's lines get the new color. */
	color_edit: string | null;
	style_number: string;
	name: string;
	unit_price: number;
	/** Size → qty entered by the user (0 or missing = no qty). */
	qty_by_size: Record<string, number>;
	/** All sizes the product carries; drives which sizes we consider for insert. */
	available_sizes: string[];
	/** The underlying order_lines grouped into this row (empty array for brand-new rows). */
	lines: ExistingLine[];
	/** User trashed the whole row — soft-remove all of its lines. */
	to_remove: boolean;
};

export type InsertOp = {
	kind: 'insert';
	row: {
		product_id: string;
		style_number: string;
		description: string;
		color: string | null;
		size: string | null;
		qty: number;
		unit_price: number;
	};
};

export type UpdateOp = {
	kind: 'update';
	id: string;
	patch: { qty?: number; color?: string | null };
};

export type SoftRemoveOp = {
	kind: 'soft_remove';
	id: string;
};

export type DiffOp = InsertOp | UpdateOp | SoftRemoveOp;

/**
 * Compare draftRows to the live state (embedded in each row's `lines`) and
 * return the list of DB operations that would reconcile them. Deterministic
 * and order-independent.
 *
 * Rules:
 *  - `to_remove` → soft_remove every line in the row.
 *  - Per size in `available_sizes`:
 *      newQty > 0, no existing line → insert
 *      newQty > 0, existing line, qty differs → update qty
 *      newQty === 0, existing line → soft_remove
 *      else → no-op
 *  - If `color_edit !== color`, every not-removed line in the row gets a
 *    color update (merged into the size update when both change).
 */
export function diffLineEdits(draftRows: DraftRowInput[]): DiffOp[] {
	const ops: DiffOp[] = [];

	for (const row of draftRows) {
		if (row.to_remove) {
			for (const l of row.lines) ops.push({ kind: 'soft_remove', id: l.id });
			continue;
		}

		const colorChanged = row.color_edit !== row.color;
		const newColor = row.color_edit;

		// Every size the product carries, plus any sizes that already exist on
		// the row but aren't in available_sizes (e.g. a legacy size no longer
		// sold — we still want to reconcile qty/remove).
		const sizes = new Set<string>(row.available_sizes);
		for (const l of row.lines) sizes.add(l.size ?? '');

		for (const size of sizes) {
			const normalizedSize = size === '' ? null : size;
			const existing = row.lines.find((l) => (l.size ?? null) === normalizedSize);
			const newQty = Math.max(0, Math.floor(row.qty_by_size[size] ?? 0));

			if (!existing && newQty > 0) {
				ops.push({
					kind: 'insert',
					row: {
						product_id: row.product_id,
						style_number: row.style_number,
						description: row.name,
						color: newColor,
						size: normalizedSize,
						qty: newQty,
						unit_price: row.unit_price
					}
				});
				continue;
			}

			if (existing && newQty === 0) {
				ops.push({ kind: 'soft_remove', id: existing.id });
				continue;
			}

			if (existing && newQty > 0) {
				const patch: UpdateOp['patch'] = {};
				if (existing.qty !== newQty) patch.qty = newQty;
				if (colorChanged) patch.color = newColor;
				if (Object.keys(patch).length > 0) {
					ops.push({ kind: 'update', id: existing.id, patch });
				}
			}
		}
	}

	return ops;
}
