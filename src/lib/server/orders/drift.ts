/**
 * Drift between what an offline order captured and what is true at sync
 * (SCO-209). Prices rarely change and terms rarely get replaced, so this is a
 * safety net: a drifted order is saved as a draft for the rep to review rather
 * than submitted on numbers the rep never saw.
 */

export type Drift = { priceLines: number; termsBrands: number };

/** Below a cent is rounding, not a price change. */
const PRICE_EPSILON = 0.005;

export function detectDrift(
	lines: Array<{ product_id: string; unit_price?: number }>,
	products: Map<string, { wholesale_price: number | string }>,
	staleTermsBrandIds: string[]
): Drift | null {
	let priceLines = 0;
	for (const line of lines) {
		// Older clients sent no price; there is nothing to compare.
		if (line.unit_price === undefined) continue;
		const current = Number(products.get(line.product_id)?.wholesale_price);
		if (!Number.isFinite(current)) continue;
		if (Math.abs(current - line.unit_price) > PRICE_EPSILON) priceLines++;
	}
	const termsBrands = new Set(staleTermsBrandIds).size;
	return priceLines || termsBrands ? { priceLines, termsBrands } : null;
}

/** One line for the sync panel, the toast and the notification. */
export function driftReason(d: Drift): string {
	const parts: string[] = [];
	if (d.priceLines) {
		parts.push(
			`prices changed on ${d.priceLines} ${d.priceLines === 1 ? 'line' : 'lines'} since it was written`
		);
	}
	if (d.termsBrands) {
		parts.push(
			d.termsBrands === 1
				? 'a brand updated its terms'
				: `${d.termsBrands} brands updated their terms`
		);
	}
	return `Saved as a draft: ${parts.join(', and ')}.`;
}
