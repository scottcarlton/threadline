/**
 * Validation for the two other client-supplied prompt inputs.
 *
 * `currentPage` and `entityContext` come from the request body and land in the
 * *dynamic system prompt*, not in a user turn. System text carries more
 * authority than anything the user says, so unvalidated strings there are worse
 * than the same strings in the conversation.
 *
 * Both were passed through untouched. `describeCurrentPage` recognised a list of
 * known routes and otherwise returned the caller's string verbatim, and the
 * entity summary was interpolated as-is.
 *
 * Neither is a privilege escalation on its own: the tool layer still scopes
 * every read and write to the caller's org. What it buys an attacker is the
 * ability to put arbitrary text at system authority, which is the foothold the
 * rest of the prompt rules sit on.
 */

/** Entity kinds the client may claim to be looking at (see stores/entityContext.ts). */
export const ENTITY_TYPES = ['order', 'account', 'brand'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type EntityContextInput = {
	type: EntityType;
	id: string | null;
	summary: string;
};

/** Summaries are one short line naming a record. Anything longer is not that. */
export const MAX_SUMMARY_CHARS = 200;

/** Routes are our own paths, so the shape is known and narrow. */
const SAFE_PATH = /^\/[A-Za-z0-9\-_/]{0,120}$/;

/**
 * Whether a path is shaped like one of our routes.
 *
 * Deliberately excludes whitespace, newlines, and punctuation. A real route
 * never contains them, and they are what turn an echoed string into a prompt
 * of its own.
 */
export function isSafePath(path: unknown): path is string {
	return typeof path === 'string' && (path === '/' || SAFE_PATH.test(path));
}

/**
 * Collapse a client string into something safe to interpolate: no newlines, no
 * angle brackets that could imitate our own prompt fences, bounded length.
 */
export function flattenForPrompt(value: string, maxChars: number): string {
	return value
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/[<>]/g, '')
		.replace(/\s{2,}/g, ' ')
		.trim()
		.slice(0, maxChars);
}

/**
 * Validate the entity the client says is on screen.
 *
 * Returns null when anything is off, since this is a convenience that saves the
 * user re-specifying which order they mean. Dropping it costs a clarifying
 * question; trusting it costs prompt integrity.
 */
export function sanitizeEntityContext(raw: unknown): EntityContextInput | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const input = raw as Record<string, unknown>;

	if (!ENTITY_TYPES.includes(input.type as EntityType)) return null;
	if (typeof input.summary !== 'string') return null;

	const summary = flattenForPrompt(input.summary, MAX_SUMMARY_CHARS);
	if (!summary) return null;

	return {
		type: input.type as EntityType,
		id: typeof input.id === 'string' ? input.id : null,
		summary
	};
}
