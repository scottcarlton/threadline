import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

let _resend: Resend | null = null;
function getResend(): Resend {
	if (!_resend) {
		if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
		_resend = new Resend(env.RESEND_API_KEY);
	}
	return _resend;
}

/**
 * Verify a Resend webhook request using Svix signature headers.
 * Returns the parsed event payload if valid, null otherwise.
 */
export async function verifyWebhook(
	rawBody: string,
	requestHeaders: globalThis.Headers
): Promise<ResendWebhookEvent | null> {
	const secret = env.RESEND_WEBHOOK_SECRET;
	if (!secret) throw new Error('RESEND_WEBHOOK_SECRET is not set');

	const svixHeaders = {
		id: requestHeaders.get('svix-id') ?? '',
		timestamp: requestHeaders.get('svix-timestamp') ?? '',
		signature: requestHeaders.get('svix-signature') ?? ''
	};

	if (!svixHeaders.id || !svixHeaders.timestamp || !svixHeaders.signature) {
		return null;
	}

	try {
		const event = getResend().webhooks.verify({
			payload: rawBody,
			headers: svixHeaders,
			webhookSecret: secret
		});
		return event as ResendWebhookEvent;
	} catch {
		return null;
	}
}

/**
 * Fetch the full received email (body, headers, message_id) from the Resend API.
 */
export async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail | null> {
	const { data, error } = await getResend().emails.receiving.get(emailId);
	if (error || !data) return null;

	return {
		id: data.id,
		from: data.from,
		to: data.to,
		subject: data.subject,
		text: data.text,
		html: data.html,
		headers: data.headers,
		messageId: data.message_id,
		cc: data.cc,
		bcc: data.bcc,
		createdAt: data.created_at
	};
}

/**
 * Extract the email address from a "From" header value.
 * Handles `"Display Name" <email@example.com>` and bare `email@example.com`.
 */
export function extractEmailAddress(from: string): string {
	const match = from.match(/<([^>]+)>/);
	return (match ? match[1] : from).trim().toLowerCase();
}

// ── Types ────────────────────────────────────────────────────

export type ResendWebhookEvent = {
	type: string;
	created_at: string;
	data: {
		email_id: string;
		from: string;
		to: string[];
		subject: string;
		attachments?: Array<{
			id: string;
			filename: string;
			content_type: string;
		}>;
	};
};

export type ReceivedEmail = {
	id: string;
	from: string;
	to: string[];
	subject: string;
	text: string | null;
	html: string | null;
	headers: Record<string, string> | null;
	messageId: string;
	cc: string[] | null;
	bcc: string[] | null;
	createdAt: string;
};
