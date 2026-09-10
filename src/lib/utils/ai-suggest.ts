// Typeahead matching for the AI dock input.
//
// Pure so it can be tested without a component. The panel that renders the
// result lives in `src/lib/components/ai/SuggestionPanel.svelte`.
//
// This is typeahead, not search: a row is offered only when the suggestion
// starts with what was typed, so every row completes the sentence in progress.
// Matching a word buried mid-sentence produces rows the user cannot read as a
// completion of their own typing, which is worse than showing nothing.
//
// Ranking is by whether the entry belongs to the current route, then catalog
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
	/**
	 * Length of the leading run the user already typed, for dimming it. Always
	 * anchored at index 0 — a match that is not a prefix is not offered.
	 */
	matchLength: number;
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

type Candidate = SuggestionMatch & { onRoute: boolean; order: number };

function matchPrefix(
	entry: AiSuggestion,
	query: string,
	order: number,
	path: string
): Candidate | null {
	if (!normalize(entry.text).startsWith(query)) return null;

	return {
		text: entry.text,
		matchLength: query.length,
		onRoute: (entry.routes ?? []).some((prefix) => path.startsWith(prefix)),
		order
	};
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

	const matches: Candidate[] = [];
	catalog.forEach((entry, order) => {
		if (!isVisible(entry, ctx)) return;
		const hit = matchPrefix(entry, query, order, ctx.path);
		if (hit) matches.push(hit);
	});

	matches.sort((a, b) => {
		if (a.onRoute !== b.onRoute) return a.onRoute ? -1 : 1;
		return a.order - b.order;
	});

	return matches.slice(0, MAX_SUGGESTIONS).map(({ text, matchLength }) => ({ text, matchLength }));
}
