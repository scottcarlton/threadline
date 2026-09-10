// Typeahead matching for the AI dock input.
//
// Pure so it can be tested without a component. The panel that renders the
// result lives in `src/lib/components/ai/SuggestionPanel.svelte`.
//
// Match strategy mirrors `csv-column-suggest.ts`: normalize, then score by how
// early and how literally the typed text lands.
//
//   1. The suggestion starts with what was typed.
//   2. Some word in the suggestion starts with what was typed.
//   3. A keyword starts with what was typed.
//
// Ties break on whether the entry belongs to the current route, then on catalog
// order. Route is a tie-breaker rather than a filter: typing "commission" on
// /orders should still surface the commission prompts.

import {
	AI_SUGGESTIONS,
	type AiSuggestion,
	type SuggestionEntity
} from '$lib/data/ai-suggestions.js';
import type { OrgType, UserRole } from '$lib/types/database.js';

/** Below this, the typed text matches too much to be worth ranking. */
export const MIN_QUERY_LENGTH = 2;

/** The panel shows at most this many rows. */
export const MAX_SUGGESTIONS = 6;

const SCORE_TEXT_PREFIX = 3;
const SCORE_WORD_PREFIX = 2;
const SCORE_KEYWORD = 1;

export type SuggestionContext = {
	/** Raw text from the input. */
	query: string;
	/** `$page.url.pathname`. */
	path: string;
	orgType: OrgType;
	role: UserRole;
	/** null means unrestricted brand access. */
	brandScope: string[] | null;
	/** The record on screen, if any. */
	entityType: SuggestionEntity | null;
};

export type SuggestionMatch = {
	text: string;
	/** Start of the matched run within `text`, for dimming what was typed. */
	matchStart: number;
	/** End of the matched run, exclusive. */
	matchEnd: number;
};

function normalize(value: string): string {
	return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Whether the caller may be offered this entry at all.
 *
 * Mirrors the gates `/api/ai` already enforces, so a suggestion never leads to
 * a refusal the user could not have predicted.
 */
function isVisible(entry: AiSuggestion, ctx: SuggestionContext): boolean {
	if (entry.orgTypes && !entry.orgTypes.includes(ctx.orgType)) return false;
	if (entry.roles && !entry.roles.includes(ctx.role)) return false;
	if (entry.unscopedOnly && ctx.brandScope !== null) return false;
	if (entry.entity && entry.entity !== ctx.entityType) return false;
	return true;
}

/** Index of the first word in `haystack` that starts with `needle`, or -1. */
function wordPrefixIndex(haystack: string, needle: string): number {
	let from = 0;
	while (from <= haystack.length - needle.length) {
		const at = haystack.indexOf(needle, from);
		if (at === -1) return -1;
		if (at === 0 || !/[a-z0-9]/.test(haystack[at - 1])) return at;
		from = at + 1;
	}
	return -1;
}

type Scored = SuggestionMatch & { score: number; onRoute: boolean; order: number };

function score(entry: AiSuggestion, query: string, order: number, path: string): Scored | null {
	const text = normalize(entry.text);
	const onRoute = (entry.routes ?? []).some((prefix) => path.startsWith(prefix));

	if (text.startsWith(query)) {
		return {
			text: entry.text,
			matchStart: 0,
			matchEnd: query.length,
			score: SCORE_TEXT_PREFIX,
			onRoute,
			order
		};
	}

	const wordAt = wordPrefixIndex(text, query);
	if (wordAt !== -1) {
		return {
			text: entry.text,
			matchStart: wordAt,
			matchEnd: wordAt + query.length,
			score: SCORE_WORD_PREFIX,
			onRoute,
			order
		};
	}

	// A keyword hit means the text itself carries no visible match, so there is
	// nothing to dim. Highlighting an arbitrary run would misreport the reason
	// the row is here.
	if ((entry.keywords ?? []).some((keyword) => normalize(keyword).startsWith(query))) {
		return { text: entry.text, matchStart: 0, matchEnd: 0, score: SCORE_KEYWORD, onRoute, order };
	}

	return null;
}

/**
 * Rank the catalog against what the user has typed, best match first.
 *
 * The panel renders above the input, so it reverses this to put the best match
 * nearest the cursor.
 */
export function suggestPrompts(
	ctx: SuggestionContext,
	catalog: AiSuggestion[] = AI_SUGGESTIONS
): SuggestionMatch[] {
	const query = normalize(ctx.query);
	if (query.length < MIN_QUERY_LENGTH) return [];

	const scored: Scored[] = [];
	catalog.forEach((entry, order) => {
		if (!isVisible(entry, ctx)) return;
		const hit = score(entry, query, order, ctx.path);
		if (hit) scored.push(hit);
	});

	scored.sort((a, b) => {
		if (a.score !== b.score) return b.score - a.score;
		if (a.onRoute !== b.onRoute) return a.onRoute ? -1 : 1;
		return a.order - b.order;
	});

	return scored
		.slice(0, MAX_SUGGESTIONS)
		.map(({ text, matchStart, matchEnd }) => ({ text, matchStart, matchEnd }));
}
