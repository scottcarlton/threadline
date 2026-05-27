import { supabaseAdmin } from '$lib/server/supabase.js';
import type { MessagingChannel, MessagingSession, ConversationMessage } from './types.js';

const SESSION_TIMEOUT_MINUTES = 30;

export function shouldExpireSession(updatedAt: string, timeoutMinutes: number): boolean {
	const elapsed = Date.now() - new Date(updatedAt).getTime();
	return elapsed > timeoutMinutes * 60 * 1000;
}

export function buildConversationHistory(
	history: ConversationMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
	return history.map((msg) => ({
		role: msg.role,
		content: msg.content
	}));
}

export async function getOrCreateSession(
	profileId: string,
	organizationId: string,
	phone: string,
	channel: MessagingChannel
): Promise<MessagingSession> {
	const { data: existing } = await supabaseAdmin
		.from('messaging_sessions')
		.select('*')
		.eq('phone_number', phone)
		.eq('channel', channel)
		.eq('status', 'active')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (existing) {
		const session = existing as Record<string, unknown>;
		if (shouldExpireSession(session.updated_at as string, SESSION_TIMEOUT_MINUTES)) {
			await supabaseAdmin
				.from('messaging_sessions')
				.update({ status: 'expired' })
				.eq('id', session.id as string);
		} else {
			return rowToSession(session);
		}
	}

	const { data: newSession, error } = await supabaseAdmin
		.from('messaging_sessions')
		.insert({
			profile_id: profileId,
			organization_id: organizationId,
			phone_number: phone,
			channel,
			conversation_history: [],
			status: 'active',
			expires_at: new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()
		})
		.select()
		.single();

	if (error || !newSession) {
		throw new Error(`Failed to create messaging session: ${error?.message ?? 'unknown'}`);
	}

	return rowToSession(newSession as Record<string, unknown>);
}

export async function appendToSession(
	sessionId: string,
	message: ConversationMessage
): Promise<void> {
	const { data } = await supabaseAdmin
		.from('messaging_sessions')
		.select('conversation_history')
		.eq('id', sessionId)
		.single();

	const history = ((data as Record<string, unknown> | null)?.conversation_history ??
		[]) as ConversationMessage[];
	history.push(message);

	await supabaseAdmin
		.from('messaging_sessions')
		.update({
			conversation_history: history,
			updated_at: new Date().toISOString(),
			expires_at: new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()
		})
		.eq('id', sessionId);
}

export async function recordMessage(
	sessionId: string,
	direction: 'inbound' | 'outbound',
	body: string | null,
	providerMessageId: string | null,
	mediaUrl?: string | null,
	mediaType?: string | null
): Promise<void> {
	await supabaseAdmin.from('messaging_messages').insert({
		session_id: sessionId,
		direction,
		body,
		media_url: mediaUrl ?? null,
		media_type: mediaType ?? null,
		provider_message_id: providerMessageId
	});
}

export async function completeSession(sessionId: string): Promise<void> {
	await supabaseAdmin
		.from('messaging_sessions')
		.update({ status: 'completed', updated_at: new Date().toISOString() })
		.eq('id', sessionId);
}

function rowToSession(row: Record<string, unknown>): MessagingSession {
	return {
		id: row.id as string,
		profileId: row.profile_id as string,
		organizationId: row.organization_id as string,
		phoneNumber: row.phone_number as string,
		channel: row.channel as MessagingChannel,
		conversationHistory: (row.conversation_history ?? []) as ConversationMessage[],
		status: row.status as MessagingSession['status'],
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string,
		expiresAt: row.expires_at as string
	};
}
