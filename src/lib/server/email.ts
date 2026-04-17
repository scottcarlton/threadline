import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { supabaseAdmin } from './supabase.js';

const DEV_FROM = 'Threadline <onboarding@resend.dev>';

let _resend: Resend | null = null;
function getResend(): Resend {
	if (!_resend) {
		if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
		_resend = new Resend(env.RESEND_API_KEY);
	}
	return _resend;
}

export type SendEmailArgs = {
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	from?: string;
	replyTo?: string;
	template: string;
	relatedType?: string;
	relatedId?: string;
	profileId?: string;
	organizationId?: string;
};

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
	const from = dev ? DEV_FROM : (args.from ?? env.EMAIL_FROM ?? DEV_FROM);
	const toList = Array.isArray(args.to) ? args.to : [args.to];

	const { data, error } = await getResend().emails.send({
		from,
		to: toList,
		subject: args.subject,
		html: args.html,
		text: args.text,
		replyTo: args.replyTo
	});

	const logBase = {
		to_email: toList.join(', '),
		from_email: from,
		subject: args.subject,
		template: args.template,
		related_type: args.relatedType ?? null,
		related_id: args.relatedId ?? null,
		profile_id: args.profileId ?? null,
		organization_id: args.organizationId ?? null
	};

	if (error || !data) {
		const message = error?.message ?? 'Unknown Resend error';
		await supabaseAdmin
			.from('transactional_email_log')
			.insert({ ...logBase, status: 'failed', error: message });
		return { ok: false, error: message };
	}

	await supabaseAdmin
		.from('transactional_email_log')
		.insert({ ...logBase, status: 'sent', provider_message_id: data.id });

	return { ok: true, id: data.id };
}
