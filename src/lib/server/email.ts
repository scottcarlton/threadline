import { BrevoClient, BrevoError } from '@getbrevo/brevo';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { supabaseAdmin } from './supabase.js';

let _brevo: BrevoClient | null = null;
function getBrevoClient(): BrevoClient {
	if (!_brevo) {
		if (!env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is not set');
		_brevo = new BrevoClient({ apiKey: env.BREVO_API_KEY });
	}
	return _brevo;
}

function parseSenderEnvelope(envelope: string): { name: string; email: string } {
	const match = envelope.match(/^(.+?)\s*<(.+?)>$/);
	if (match) return { name: match[1].trim(), email: match[2].trim() };
	return { name: '', email: envelope.trim() };
}

export type EmailAttachment = {
	filename: string;
	content: Buffer;
};

export type SendEmailArgs = {
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	from?: string;
	replyTo?: string;
	attachments?: EmailAttachment[];
	templateId?: number;
	params?: Record<string, string | number>;
	template: string;
	relatedType?: string;
	relatedId?: string;
	profileId?: string;
	organizationId?: string;
};

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
	const fromEnvelope = dev
		? (env.EMAIL_FROM ?? 'Threadline <noreply@threadline.systems>')
		: (args.from ?? env.EMAIL_FROM ?? 'Threadline <noreply@threadline.systems>');
	const sender = parseSenderEnvelope(fromEnvelope);
	const toList = Array.isArray(args.to) ? args.to : [args.to];

	try {
		const response = await getBrevoClient().transactionalEmails.sendTransacEmail({
			...(args.templateId
				? { templateId: args.templateId, params: args.params }
				: {
						subject: args.subject,
						htmlContent: args.html,
						textContent: args.text
					}),
			sender,
			to: toList.map((email) => ({ email })),
			replyTo: args.replyTo ? { email: args.replyTo } : undefined,
			attachment: args.attachments?.map((a) => ({
				name: a.filename,
				content: a.content.toString('base64')
			}))
		});

		const messageId = response.messageId ?? '';

		await supabaseAdmin.from('transactional_email_log').insert({
			to_email: toList.join(', '),
			from_email: fromEnvelope,
			subject: args.subject,
			template: args.template,
			related_type: args.relatedType ?? null,
			related_id: args.relatedId ?? null,
			profile_id: args.profileId ?? null,
			organization_id: args.organizationId ?? null,
			status: 'sent',
			provider_message_id: messageId
		});

		return { ok: true, id: messageId };
	} catch (err) {
		const message =
			err instanceof BrevoError
				? err.message
				: err instanceof Error
					? err.message
					: 'Unknown Brevo error';

		await supabaseAdmin.from('transactional_email_log').insert({
			to_email: toList.join(', '),
			from_email: fromEnvelope,
			subject: args.subject,
			template: args.template,
			related_type: args.relatedType ?? null,
			related_id: args.relatedId ?? null,
			profile_id: args.profileId ?? null,
			organization_id: args.organizationId ?? null,
			status: 'failed',
			error: message
		});

		return { ok: false, error: message };
	}
}
