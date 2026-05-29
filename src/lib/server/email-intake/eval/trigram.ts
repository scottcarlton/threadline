/**
 * Deterministic trigram similarity for the eval mock.
 * Approximates pg_trgm's similarity() — Dice coefficient over character trigrams.
 * Does not need to match Postgres exactly; needs to be deterministic and
 * discriminate correctly at THRESHOLDS boundaries.
 */

function trigrams(s: string): Set<string> {
	const padded = `  ${s.toLowerCase()} `;
	const tris = new Set<string>();
	for (let i = 0; i < padded.length - 2; i++) {
		tris.add(padded.slice(i, i + 3));
	}
	return tris;
}

export function trigramSimilarity(a: string, b: string): number {
	if (a === b) return 1.0;
	if (!a || !b) return 0;

	const ta = trigrams(a);
	const tb = trigrams(b);

	let intersection = 0;
	for (const t of ta) {
		if (tb.has(t)) intersection++;
	}

	const denom = ta.size + tb.size;
	if (denom === 0) return 0;

	return (2 * intersection) / denom;
}
