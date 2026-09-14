import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConversation } from '$lib/server/ai-conversations.js';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization || locals.isBuyer) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// getConversation filters on profile_id itself, so a conversation owned by
	// someone else is indistinguishable from one that does not exist.
	const conversation = await getConversation(params.id, locals.user.id);
	if (!conversation) return json({ error: 'Conversation not found' }, { status: 404 });

	return json(conversation);
};
