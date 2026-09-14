/**
 * Persistence for the in-app assistant's conversations.
 *
 * History for an existing conversation is read from here rather than from the
 * request body. ai-history.ts exists because client-supplied history is
 * untrusted: a caller could hand the model a fabricated account of its own
 * past, including forged tool results. Rows this module wrote have no such
 * problem, so the database path applies only the trim and skips validation.
 *
 * Every call goes through supabaseAdmin, because @supabase/ssr drops the JWT
 * on writes. That bypasses RLS, so every function taking a conversationId
 * either verifies ownership itself or documents that its caller already did.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase.js';
import {
	applyHistoryLimits,
	DEFAULT_HISTORY_LIMITS,
	type HistoryLimits,
	type PlainTurn
} from './ai-history.js';

export type StoredAttachment = { name: string; type: string; size: number };

export type ConversationSummary = {
	id: string;
	title: string | null;
	updated_at: string;
};

export type ConversationDetail = {
	id: string;
	title: string | null;
	organizationId: string;
	messages: Array<{
		role: 'user' | 'assistant';
		content: string;
		attachments: StoredAttachment[] | null;
	}>;
};

const MAX_TITLE_CHARS = 60;
const FALLBACK_TITLE_CHARS = 50;
const DEFAULT_LIST_LIMIT = 20;

/** Stored rows to Messages API params. Empty turns are dropped, not sent. */
export function toHistoryMessages(
	rows: PlainTurn[],
	limits: HistoryLimits = DEFAULT_HISTORY_LIMITS
): Anthropic.MessageParam[] {
	const nonEmpty = rows
		.map((row) => ({ role: row.role, content: row.content.trim() }))
		.filter((row) => row.content.length > 0);
	return applyHistoryLimits(nonEmpty, limits).map((turn) => ({
		role: turn.role,
		content: turn.content
	}));
}

/** Clean a model-generated title, or null if nothing usable came back. */
export function normalizeTitle(raw: string): string | null {
	let title = raw.trim();
	if (title.startsWith('"') && title.endsWith('"') && title.length > 1) {
		title = title.slice(1, -1).trim();
	}
	if (title.endsWith('.')) title = title.slice(0, -1).trim();
	if (!title) return null;
	return title.length > MAX_TITLE_CHARS ? title.slice(0, MAX_TITLE_CHARS) : title;
}

/** Used when title generation fails or returns nothing usable. */
export function fallbackTitle(firstUserMessage: string): string | null {
	const flat = firstUserMessage.replace(/\s+/g, ' ').trim();
	if (!flat) return null;
	return flat.length > FALLBACK_TITLE_CHARS ? flat.slice(0, FALLBACK_TITLE_CHARS) + '...' : flat;
}

/** Returns the new conversation id, or null if the insert failed. */
export async function createConversation(
	profileId: string,
	organizationId: string
): Promise<string | null> {
	const { data, error } = await supabaseAdmin
		.from('ai_conversations')
		.insert({ profile_id: profileId, organization_id: organizationId })
		.select('id')
		.single();
	if (error) {
		console.error('ai_conversations insert failed:', error.message);
		return null;
	}
	return (data as { id: string }).id;
}

/**
 * Ownership gate for every caller that accepts a conversationId from a request
 * body. supabaseAdmin bypasses RLS, so this is the only thing standing between
 * a guessed id and another user's thread.
 */
export async function conversationBelongsTo(
	conversationId: string,
	profileId: string
): Promise<boolean> {
	const { data, error } = await supabaseAdmin
		.from('ai_conversations')
		.select('id')
		.eq('id', conversationId)
		.eq('profile_id', profileId)
		.maybeSingle();
	if (error) {
		console.error('ai_conversations ownership check failed:', error.message);
		return false;
	}
	return data !== null;
}

/**
 * Append a turn and bump the conversation's updated_at so it sorts to the top
 * of the recents list. Caller must have verified ownership.
 *
 * Failures are logged and swallowed: a user should never lose an answer
 * because a history insert failed.
 */
export async function appendMessage(
	conversationId: string,
	role: 'user' | 'assistant',
	content: string,
	attachments: StoredAttachment[] | null = null
): Promise<void> {
	const { error } = await supabaseAdmin.from('ai_messages').insert({
		conversation_id: conversationId,
		role,
		content,
		attachments
	});
	if (error) {
		console.error('ai_messages insert failed:', error.message);
		return;
	}
	const { error: bumpError } = await supabaseAdmin
		.from('ai_conversations')
		.update({ updated_at: new Date().toISOString() })
		.eq('id', conversationId);
	if (bumpError) console.error('ai_conversations updated_at bump failed:', bumpError.message);
}

/** Caller must have verified ownership. */
export async function loadHistory(
	conversationId: string,
	limits: HistoryLimits = DEFAULT_HISTORY_LIMITS
): Promise<Anthropic.MessageParam[]> {
	const { data, error } = await supabaseAdmin
		.from('ai_messages')
		.select('role, content')
		.eq('conversation_id', conversationId)
		.order('created_at', { ascending: true });
	if (error) {
		console.error('ai_messages select failed:', error.message);
		return [];
	}
	const rows = (data ?? []) as PlainTurn[];
	return toHistoryMessages(rows, limits);
}

/**
 * The recents list. Conversations with no messages are excluded so a thread
 * whose very first request failed never appears as an empty row.
 */
export async function listConversations(
	profileId: string,
	limit: number = DEFAULT_LIST_LIMIT
): Promise<ConversationSummary[]> {
	const { data, error } = await supabaseAdmin
		.from('ai_conversations')
		.select('id, title, updated_at, ai_messages!inner(id)')
		.eq('profile_id', profileId)
		.order('updated_at', { ascending: false })
		.limit(limit);
	if (error) {
		console.error('ai_conversations list failed:', error.message);
		return [];
	}
	// !inner filters to conversations that have at least one message. PostgREST
	// embeds the join as a nested array, so this is already one row per
	// conversation; the nested field drives the filter and is discarded here.
	const rows = (data ?? []) as Array<{
		id: string;
		title: string | null;
		updated_at: string;
	}>;
	return rows.map((row) => ({ id: row.id, title: row.title, updated_at: row.updated_at }));
}

/** Null when the conversation does not exist or belongs to someone else. */
export async function getConversation(
	conversationId: string,
	profileId: string
): Promise<ConversationDetail | null> {
	const { data: conversation, error } = await supabaseAdmin
		.from('ai_conversations')
		.select('id, title, organization_id')
		.eq('id', conversationId)
		.eq('profile_id', profileId)
		.maybeSingle();
	if (error || !conversation) {
		if (error) console.error('ai_conversations select failed:', error.message);
		return null;
	}
	const row = conversation as { id: string; title: string | null; organization_id: string };

	const { data: messages, error: messagesError } = await supabaseAdmin
		.from('ai_messages')
		.select('role, content, attachments')
		.eq('conversation_id', conversationId)
		.order('created_at', { ascending: true });
	if (messagesError) {
		console.error('ai_messages select failed:', messagesError.message);
		return null;
	}

	return {
		id: row.id,
		title: row.title,
		organizationId: row.organization_id,
		messages: (messages ?? []) as ConversationDetail['messages']
	};
}

/** Caller must have verified ownership. */
export async function setTitle(conversationId: string, title: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from('ai_conversations')
		.update({ title })
		.eq('id', conversationId);
	if (error) console.error('ai_conversations title update failed:', error.message);
}
