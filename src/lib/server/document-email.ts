import { supabaseAdmin } from '$lib/server/supabase';
import { getGmailClient, buildRawEmail } from '$lib/server/gmail';
import { sendEmail } from '$lib/server/email';

export type DocumentAttachment = { filename: string; mimeType: string; content: Buffer };

export type DeliveryResult =
	| { delivered: true; messageId?: string }
	| { delivered: false; channel: 'gmail' | 'email'; reason: string };

/**
 * Sends an issued document (invoice, credit memo) to the buyer, and records it.
 *
 * Through the sender's own Gmail when they have connected it, so the document
 * arrives from a person the buyer recognises and the thread lands in their
 * sent mail; otherwise through transactional email, with replies routed back
 * to the sender. Either way the send is logged against the document
 * (`email_log` or `transactional_email_log`, keyed by relatedType/relatedId).
 *
 * Never throws for a delivery failure. The document is already issued by the
 * time this runs, and callers report "issued but not delivered" separately
 * from "not issued", so the brand never believes a buyer has a document they
 * did not receive.
 */
export async function deliverDocument(args: {
	userId: string;
	organizationId: string;
	recipient: string;
	subject: string;
	body: string;
	attachment: DocumentAttachment;
	relatedType: string;
	relatedId: string;
	/** Transactional template name, for the log. */
	template: string;
	/** Local part of the transactional From address, e.g. `invoices`. */
	fromLocalPart: string;
}): Promise<DeliveryResult> {
	const gmail = await getGmailClient(args.userId);
	const { data: connection } = gmail
		? await supabaseAdmin
				.from('email_connections')
				.select('email_address')
				.eq('profile_id', args.userId)
				.eq('provider', 'gmail')
				.single()
		: { data: null };

	if (gmail && connection) {
		try {
			const raw = buildRawEmail(
				connection.email_address,
				args.recipient,
				args.subject,
				args.body,
				undefined,
				[args.attachment]
			);
			const result = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });

			await supabaseAdmin.from('email_log').insert({
				organization_id: args.organizationId,
				sent_by: args.userId,
				to_email: args.recipient,
				subject: args.subject,
				body: args.body,
				gmail_message_id: result.data.id ?? '',
				gmail_thread_id: result.data.threadId ?? null,
				related_type: args.relatedType,
				related_id: args.relatedId
			});

			return { delivered: true };
		} catch (err) {
			return {
				delivered: false,
				channel: 'gmail',
				reason: err instanceof Error ? err.message : 'unknown error'
			};
		}
	}

	const { data: profile } = await supabaseAdmin
		.from('profiles')
		.select('first_name, last_name')
		.eq('id', args.userId)
		.single();

	const senderName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Team';
	const userEmail =
		(await supabaseAdmin.auth.admin.getUserById(args.userId)).data?.user?.email ?? undefined;

	const result = await sendEmail({
		to: args.recipient,
		subject: args.subject,
		html: `<pre style="font-family: sans-serif; white-space: pre-wrap;">${args.body}</pre>`,
		text: args.body,
		from: `${senderName} via Threadline <${args.fromLocalPart}@threadline.systems>`,
		replyTo: userEmail,
		attachments: [{ filename: args.attachment.filename, content: args.attachment.content }],
		template: args.template,
		relatedType: args.relatedType,
		relatedId: args.relatedId,
		profileId: args.userId,
		organizationId: args.organizationId
	});

	if (!result.ok) return { delivered: false, channel: 'email', reason: result.error };
	return { delivered: true, messageId: result.id };
}
