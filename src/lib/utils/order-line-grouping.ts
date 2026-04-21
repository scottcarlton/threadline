// Pure grouping of order_lines into `(style, color)` rows for the detail page.
// Mirrors the inline logic that previously lived in src/routes/orders/[id]/+page.svelte
// so the rendering code can stay a thin consumer and so the behavior is covered
// by unit tests. Kept free of Supabase/Svelte imports so it runs in isolation.

export type ActiveOrderLine = {
	id: string;
	product_id: string | null;
	style_number: string | null;
	description: string | null;
	color: string | null;
	size: string | null;
	qty: number;
	unit_price: number | string;
	original_qty: number | null;
};

export type ProductMeta = {
	primary_image_id: string | null;
	colors: string[];
	sizes: string[];
	season_name: string | null;
	season_year: number | null;
};

export type GroupedLine = {
	id: string;
	size: string | null;
	qty: number;
	original_qty: number | null;
};

export type LineGroup = {
	key: string;
	product_id: string;
	style_number: string;
	name: string;
	season_label: string | null;
	image_id: string | null;
	unit_price: number;
	color: string | null;
	available_colors: string[];
	available_sizes: string[];
	lines: GroupedLine[];
	units: number;
	total: number;
};

/**
 * Group order_lines by `(product_id, color)`.
 *
 * Lines without a `product_id` are excluded — they're rendered separately as
 * "custom lines" today. Groups preserve first-seen order so UI rendering stays
 * stable across reloads.
 *
 * `units` and `total` are aggregated per group so consumers don't have to
 * recompute them.
 */
export function groupLinesByStyleColor(
	lines: ActiveOrderLine[],
	productsById: Record<string, ProductMeta>
): LineGroup[] {
	const byKey = new Map<string, LineGroup>();

	for (const l of lines) {
		const pid = l.product_id;
		if (!pid) continue;

		const meta = productsById[pid];
		const key = `${pid}|${l.color ?? ''}`;

		let group = byKey.get(key);
		if (!group) {
			const season =
				meta?.season_name && meta?.season_year
					? `${meta.season_name} ${meta.season_year}`
					: (meta?.season_name ?? null);
			group = {
				key,
				product_id: pid,
				style_number: l.style_number ?? '',
				name: l.description ?? l.style_number ?? '',
				season_label: season,
				image_id: meta?.primary_image_id ?? null,
				unit_price: Number(l.unit_price),
				color: l.color,
				available_colors: meta?.colors ?? [],
				available_sizes: meta?.sizes ?? [],
				lines: [],
				units: 0,
				total: 0
			};
			byKey.set(key, group);
		}

		group.lines.push({
			id: l.id,
			size: l.size,
			qty: l.qty,
			original_qty: l.original_qty
		});
		group.units += l.qty;
		group.total += l.qty * group.unit_price;
	}

	return [...byKey.values()];
}
