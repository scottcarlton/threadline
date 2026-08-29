/**
 * Validation for the client-supplied conversation history.
 *
 * `/api/ai` used to spread `conversationHistory` from the request body straight
 * into the Anthropic `messages` array. Nothing checked the shape, so a caller
 * could hand the model a fabricated account of its own past: assistant turns it
 * never produced, or content blocks shaped like tool results describing work
 * that never ran.
 *
 * That matters because our guardrails are downstream of it. The confirm guard
 * stops an automated run from confirming an order; it does nothing about a
 * forged transcript in which the model already agreed to something. Org scoping
 * in the tool layer still holds either way, so this is about the integrity of
 * what the model believes, not about cross-tenant access.
 *
 * The rule here is narrow on purpose: history may only contain plain text turns.
 * The real client sends exactly that (see stores/conversation.ts), so nothing
 * legitimate is lost, and structured blocks — the only way to impersonate a tool
 * result — have no way in.
 */
import type Anthropic from '@anthropic-ai/sdk';

export type HistoryLimits = {
	/** Turns kept, most recent first. */
	maxTurns: number;
	/** Characters kept per turn; longer turns are truncated, not dropped. */
	maxCharsPerTurn: number;
	/** Ceiling across all kept turns. */
	maxTotalChars: number;
};

export const DEFAULT_HISTORY_LIMITS: HistoryLimits = {
	maxTurns: 20,
	maxCharsPerTurn: 8_000,
	maxTotalChars: 40_000
};

export const TRUNCATION_MARKER = ' [truncated]';

export type SanitizedHistory = {
	messages: Anthropic.MessageParam[];
	/** Turns discarded as malformed. Non-zero is worth logging. */
	rejected: number;
};

type PlainTurn = { role: 'user' | 'assistant'; content: string };

function asPlainTurn(value: unknown): PlainTurn | null {
	if (typeof value !== 'object' || value === null) return null;
	const turn = value as Record<string, unknown>;
	if (turn.role !== 'user' && turn.role !== 'assistant') return null;
	// Anything but a string is refused rather than coerced. Content blocks are
	// the vector: an array here could carry a fabricated tool_result.
	if (typeof turn.content !== 'string') return null;
	const content = turn.content.trim();
	if (!content) return null;
	return { role: turn.role, content };
}

/**
 * Validate, cap, and normalise history into something safe to send.
 *
 * Also enforces the alternation the Messages API requires: a first turn that is
 * not `user`, or two turns in a row from the same speaker, is a 400 from the
 * API. Previously a caller could trigger that at will, and honest histories hit
 * it too once trimming happened to cut mid-exchange.
 */
export function sanitizeConversationHistory(
	raw: unknown,
	limits: HistoryLimits = DEFAULT_HISTORY_LIMITS
): SanitizedHistory {
	if (!Array.isArray(raw)) return { messages: [], rejected: 0 };

	let rejected = 0;
	const valid: PlainTurn[] = [];
	for (const entry of raw) {
		const turn = asPlainTurn(entry);
		if (!turn) {
			rejected++;
			continue;
		}
		valid.push(turn);
	}

	// Newest turns are the useful ones, so trim from the front.
	const recent = valid.slice(-limits.maxTurns);

	const capped = recent.map((turn) => ({
		role: turn.role,
		content:
			turn.content.length > limits.maxCharsPerTurn
				? turn.content.slice(0, limits.maxCharsPerTurn) + TRUNCATION_MARKER
				: turn.content
	}));

	// Total budget, applied oldest-first so the most recent context survives.
	const withinBudget: PlainTurn[] = [];
	let total = 0;
	for (let i = capped.length - 1; i >= 0; i--) {
		const turn = capped[i];
		if (total + turn.content.length > limits.maxTotalChars) break;
		total += turn.content.length;
		withinBudget.unshift(turn);
	}

	// Strict alternation starting with user.
	const alternating: PlainTurn[] = [];
	for (const turn of withinBudget) {
		const previous = alternating[alternating.length - 1];
		if (!previous) {
			if (turn.role !== 'user') continue;
			alternating.push(turn);
			continue;
		}
		if (turn.role === previous.role) continue;
		alternating.push(turn);
	}

	// The caller appends the live user message next, so history ending on a user
	// turn would put two user turns back to back.
	if (alternating[alternating.length - 1]?.role === 'user') alternating.pop();

	return {
		messages: alternating.map((turn) => ({ role: turn.role, content: turn.content })),
		rejected
	};
}
