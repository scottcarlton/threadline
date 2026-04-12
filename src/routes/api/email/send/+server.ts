import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGmailClient, buildRawEmail, type EmailAttachment } from '$lib/server/gmail';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const gmail = await getGmailClient(locals.user.id);
	if (!gmail) {
		return json({ error: 'Gmail not connected' }, { status: 400 });
	}

	const {
		to,
		subject,
		body,
		threadId,
		relatedType,
		relatedId,
		attachments: rawAttachments
	} = await request.json();

	if (!to || !subject || !body) {
		return json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
	}

	// Get user's connected email address
	const { data: connection } = await supabaseAdmin
		.from('email_connections')
		.select('email_address')
		.eq('profile_id', locals.user.id)
		.eq('provider', 'gmail')
		.single();

	if (!connection) {
		return json({ error: 'Gmail not connected' }, { status: 400 });
	}

	// Convert base64 attachment content to Buffers
	let emailAttachments: EmailAttachment[] | undefined;
	if (rawAttachments && Array.isArray(rawAttachments) && rawAttachments.length > 0) {
		emailAttachments = rawAttachments.map(
			(a: { filename: string; mimeType: string; content: string }) => ({
				filename: a.filename,
				mimeType: a.mimeType,
				content: Buffer.from(a.content, 'base64')
			})
		);
	}

	const raw = buildRawEmail(
		connection.email_address,
		to,
		subject,
		body,
		threadId,
		emailAttachments
	);

	const sendResult = await gmail.users.messages.send({
		userId: 'me',
		requestBody: {
			raw,
			threadId: threadId || undefined
		}
	});

	const messageId = sendResult.data.id ?? '';

	// Log to email_log table
	if (locals.organization) {
		await supabaseAdmin.from('email_log').insert({
			organization_id: locals.organization.id,
			sent_by: locals.user.id,
			to_email: to,
			subject,
			body,
			gmail_message_id: messageId,
			gmail_thread_id: sendResult.data.threadId ?? null,
			related_type: relatedType ?? null,
			related_id: relatedId ?? null
		});
	}

	return json({ success: true, messageId });
};
