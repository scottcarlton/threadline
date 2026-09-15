/**
 * Shared shape rules for persisted cart lines (SCO-167).
 *
 * A cart line is keyed by (product, colour) and carries a flat
 * `{ size: quantity }` map. Both the add/update endpoint and the delete
 * endpoint parse client input through here so a malformed payload cannot land
 * in `cart_items.size_qtys` and break rehydration for the whole cart.
 */

/** Longest colour or size label we will store. Matches nothing in particular; it is a sanity bound. */
const MAX_LABEL_LENGTH = 100;
/** Upper bound on distinct sizes in a single line. Real size runs are well under this. */
const MAX_SIZES_PER_LINE = 50;
/** Upper bound on units of one size in one line. */
const MAX_QTY = 100000;

/**
 * Normalises a client-supplied size/quantity map.
 *
 * Drops non-positive, non-finite and non-numeric quantities rather than
 * storing zeroes, so an emptied line persists as `{}` and the units total
 * derived on the client stays consistent with what is in the row.
 */
export function sanitizeSizeQtys(input: unknown): Record<string, number> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

	const out: Record<string, number> = {};
	for (const [rawSize, rawQty] of Object.entries(input as Record<string, unknown>)) {
		if (Object.keys(out).length >= MAX_SIZES_PER_LINE) break;
		const size = rawSize.trim();
		if (!size || size.length > MAX_LABEL_LENGTH) continue;
		if (typeof rawQty !== 'number' || !Number.isFinite(rawQty)) continue;
		const qty = Math.floor(rawQty);
		if (qty <= 0) continue;
		out[size] = Math.min(qty, MAX_QTY);
	}
	return out;
}

/**
 * Normalises a colour selection. Empty string is the canonical "this product
 * has no colourways" value and is part of the row's uniqueness key, so it must
 * round-trip rather than becoming null.
 */
export function sanitizeSelectedColor(input: unknown): string {
	if (typeof input !== 'string') return '';
	return input.trim().slice(0, MAX_LABEL_LENGTH);
}
