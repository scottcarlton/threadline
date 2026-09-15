import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendEmail } from '$lib/server/email/service';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { to, subject, body, threadId, inReplyTo, relatedType, relatedId, attachments } =
		await request.json();

	if (!to || !subject || !body) {
		return json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
	}

	let result: { messageId: string; threadId: string | null };
	try {
		result = await sendEmail(locals.user.id, {
			to,
			subject,
			body,
			threadId,
			inReplyTo,
			attachments
		});
	} catch (err) {
		console.error('Email send error:', err);
		const message = err instanceof Error ? err.message : 'Failed to send email';
		return json({ error: message, message }, { status: 400 });
	}

	// Log to email_log table
	if (locals.organization) {
		await supabaseAdmin.from('email_log').insert({
			organization_id: locals.organization.id,
			sent_by: locals.user.id,
			to_email: to,
			subject,
			body,
			gmail_message_id: result.messageId || null,
			gmail_thread_id: result.threadId,
			related_type: relatedType ?? null,
			related_id: relatedId ?? null
		});
	}

	return json({ success: true, messageId: result.messageId });
};
