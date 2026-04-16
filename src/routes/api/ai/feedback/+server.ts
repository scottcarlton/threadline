import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PROMPT_VERSION } from '$lib/server/ai-prompts.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { messageContent, responseContent, rating, feedbackText } = await request.json();

	if (rating !== 1 && rating !== -1) {
		return json({ error: 'rating must be 1 or -1' }, { status: 400 });
	}
	if (typeof messageContent !== 'string' || typeof responseContent !== 'string') {
		return json({ error: 'messageContent and responseContent are required' }, { status: 400 });
	}

	const { error } = await locals.supabase.from('ai_feedback').insert({
		organization_id: locals.organization.id,
		user_id: locals.user.id,
		message_content: messageContent.slice(0, 10_000),
		response_content: responseContent.slice(0, 10_000),
		rating,
		feedback_text: typeof feedbackText === 'string' ? feedbackText.slice(0, 2_000) : null,
		prompt_version: PROMPT_VERSION
	});

	if (error) return json({ error: error.message }, { status: 500 });

	return json({ ok: true });
};
