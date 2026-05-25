import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Verify a Brevo inbound parse webhook using bearer token auth.
 * Brevo sends `Authorization: Bearer <token>` when configured with
 * auth type "bearer" during webhook creation.
 * Returns the parsed payload if valid, null otherwise.
 */
export function verifyWebhook(
	rawBody: string,
	requestHeaders: globalThis.Headers
): BrevoInboundPayload | null {
	const secret = env.BREVO_WEBHOOK_SECRET;
	if (!secret) throw new Error('BREVO_WEBHOOK_SECRET is not set');

	const authHeader = requestHeaders.get('authorization');
	if (!authHeader) return null;

	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	if (!match) return null;

	const token = match[1];

	try {
		const tokenBuf = Buffer.from(token);
		const secretBuf = Buffer.from(secret);
		if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) return null;
	} catch {
		return null;
	}

	try {
		return JSON.parse(rawBody) as BrevoInboundPayload;
	} catch {
		return null;
	}
}

/**
 * Map a single Brevo inbound parse item to our internal ReceivedEmail shape.
 * Brevo delivers the full parsed email in the webhook — no second fetch needed.
 */
export function parseInboundItem(item: BrevoInboundItem): ReceivedEmail {
	return {
		id: Array.isArray(item.Uuid) ? item.Uuid[0] : item.Uuid,
		from: item.From.Address,
		to: item.To.map((t) => t.Address),
		subject: item.Subject,
		text: item.RawTextBody ?? null,
		html: item.RawHtmlBody ?? null,
		headers: item.Headers ?? null,
		messageId: item.MessageId,
		cc: item.Cc?.map((c) => c.Address) ?? null,
		bcc: null,
		createdAt: item.Date
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

export type BrevoInboundPayload = {
	items: BrevoInboundItem[];
};

type BrevoEmailParty = {
	Address: string;
	Name: string | null;
};

export type BrevoInboundItem = {
	Uuid: string[] | string;
	Date: string;
	MessageId: string;
	Subject: string;
	From: BrevoEmailParty;
	To: BrevoEmailParty[];
	Cc?: BrevoEmailParty[];
	ReplyTo: string | null;
	SentAtDate: string;
	RawHtmlBody?: string;
	RawTextBody?: string;
	ExtractedMarkdownMessage?: string;
	Headers?: Record<string, string>;
	Attachments?: Array<{
		Name: string;
		ContentType: string;
		ContentLength: number;
		DownloadToken: string;
	}>;
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
