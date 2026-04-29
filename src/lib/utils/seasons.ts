// Helpers for the canonical season filter behavior. Seasons are name-based on
// the wire (URL params, filter state) so identical names across orgs/brands
// collapse into one user-facing option, mirroring the /orders pattern.

export type SeasonLike = { id: string; name: string };

/** Dedupe a list of seasons by case-insensitive name. First wins. */
export function dedupeSeasonsByName<T extends SeasonLike>(seasons: T[]): T[] {
	const seen = new Set<string>();
	return seasons.filter((s) => {
		const key = s.name.trim().toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Resolve a season name to all matching season ids (case-insensitive). */
export function seasonIdsByName(seasons: SeasonLike[], name: string): string[] {
	if (!name) return [];
	const key = name.trim().toLowerCase();
	return seasons.filter((s) => s.name.trim().toLowerCase() === key).map((s) => s.id);
}
