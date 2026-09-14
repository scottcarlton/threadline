import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listConversations } from '$lib/server/ai-conversations.js';

export const GET: RequestHandler = async ({ locals }) => {
	// Same gate as /api/ai: buyers have a session and an org but never reach the
	// org assistant.
	if (!locals.session || !locals.user || !locals.organization || locals.isBuyer) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const conversations = await listConversations(locals.user.id);
	return json({ conversations });
};
