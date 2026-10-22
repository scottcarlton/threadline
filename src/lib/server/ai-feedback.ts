import { supabaseAdmin } from './supabase.js';
import type { AiFeedbackInput } from '$lib/schemas/ai-feedback.js';

export type FeedbackLinks = {
	conversation_id: string | null;
	message_id: string | null;
	turn_id: string | null;
};

export type FeedbackLinksResult =
	| { ok: true; links: FeedbackLinks }
	| { ok: false; status: 400 | 404; error: string };

type Rater = { userId: string; organizationId: string };

/**
 * Check the ids a rating claims before they are stored.
 *
 * The lookups run through supabaseAdmin, so each one filters on the rater
 * itself: the conversation must be theirs and in their current org, the
 * message must be an answer in that conversation, and the turn must be one
 * they made. The turn comes from the stored message when there is one; the
 * client's copy is only used when the answer was never saved, and is then
 * checked against the turn's usage rows.
 *
 * Any id that does not check out fails the request rather than being dropped.
 * The client only sends ids the server gave it, so a miss is a bug or a
 * forged body, and neither should leave a row that looks linked.
 */
export async function resolveFeedbackLinks(
	input: Pick<AiFeedbackInput, 'conversationId' | 'messageId' | 'turnId'>,
	rater: Rater
): Promise<FeedbackLinksResult> {
	const links: FeedbackLinks = { conversation_id: null, message_id: null, turn_id: null };

	if (input.conversationId) {
		const { data, error } = await supabaseAdmin
			.from('ai_conversations')
			.select('id')
			.eq('id', input.conversationId)
			.eq('profile_id', rater.userId)
			.eq('organization_id', rater.organizationId)
			.maybeSingle();
		if (error) throw new Error(`ai_conversations lookup failed: ${error.message}`);
		if (!data) return { ok: false, status: 404, error: 'Conversation not found' };
		links.conversation_id = input.conversationId;
	}

	if (input.messageId) {
		const { data, error } = await supabaseAdmin
			.from('ai_messages')
			.select('turn_id')
			.eq('id', input.messageId)
			.eq('conversation_id', input.conversationId!)
			.eq('role', 'assistant')
			.maybeSingle();
		if (error) throw new Error(`ai_messages lookup failed: ${error.message}`);
		if (!data) return { ok: false, status: 404, error: 'Message not found' };
		const storedTurn = (data as { turn_id: string | null }).turn_id;
		if (input.turnId && input.turnId !== storedTurn) {
			return { ok: false, status: 400, error: 'turnId does not match the message' };
		}
		links.message_id = input.messageId;
		links.turn_id = storedTurn;
		return { ok: true, links };
	}

	if (input.turnId) {
		const { data, error } = await supabaseAdmin
			.from('ai_usage_logs')
			.select('id')
			.eq('turn_id', input.turnId)
			.eq('user_id', rater.userId)
			.eq('organization_id', rater.organizationId)
			.limit(1)
			.maybeSingle();
		if (error) throw new Error(`ai_usage_logs lookup failed: ${error.message}`);
		if (!data) return { ok: false, status: 404, error: 'Turn not found' };
		links.turn_id = input.turnId;
	}

	return { ok: true, links };
}
