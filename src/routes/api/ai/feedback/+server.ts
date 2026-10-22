import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PROMPT_VERSION } from '$lib/server/ai-prompts.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { aiFeedbackSchema } from '$lib/schemas/ai-feedback.js';
import { resolveFeedbackLinks } from '$lib/server/ai-feedback.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = aiFeedbackSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
	}
	const body = parsed.data;

	const rater = { userId: locals.user.id, organizationId: locals.organization.id };
	const resolved = await resolveFeedbackLinks(body, rater);
	if (!resolved.ok) return json({ error: resolved.error }, { status: resolved.status });

	// Admin client because @supabase/ssr drops the JWT on writes. The org and
	// user come from locals, and every linked id was checked against them above.
	const { error } = await supabaseAdmin.from('ai_feedback').insert({
		organization_id: rater.organizationId,
		user_id: rater.userId,
		message_content: body.messageContent,
		response_content: body.responseContent,
		rating: body.rating,
		feedback_text: body.feedbackText ?? null,
		prompt_version: PROMPT_VERSION,
		...resolved.links
	});

	if (error) return json({ error: error.message }, { status: 500 });

	return json({ ok: true });
};
