import { google, type gmail_v1 } from 'googleapis';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from '$env/static/private';
import { supabaseAdmin } from './supabase.js';

const SCOPES = [
	'https://www.googleapis.com/auth/gmail.readonly',
	'https://www.googleapis.com/auth/gmail.send',
	'https://www.googleapis.com/auth/gmail.compose',
	'https://www.googleapis.com/auth/gmail.modify',
	'https://www.googleapis.com/auth/userinfo.email'
];

export function getOAuthClient() {
	return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

export function getAuthUrl(state: string): string {
	const client = getOAuthClient();
	return client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
		prompt: 'consent',
		state
	});
}

export async function exchangeCode(code: string) {
	const client = getOAuthClient();
	const { tokens } = await client.getToken(code);
	return tokens;
}

export async function getGmailClient(profileId: string) {
	const { data: connection } = await supabaseAdmin
		.from('email_connections')
		.select('*')
		.eq('profile_id', profileId)
		.eq('provider', 'gmail')
		.single();

	if (!connection) return null;

	const client = getOAuthClient();
	client.setCredentials({
		access_token: connection.access_token,
		refresh_token: connection.refresh_token,
		expiry_date: connection.token_expires_at
			? new Date(connection.token_expires_at).getTime()
			: undefined
	});

	// Handle token refresh
	client.on('tokens', async (tokens) => {
		const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (tokens.access_token) updateData.access_token = tokens.access_token;
		if (tokens.expiry_date)
			updateData.token_expires_at = new Date(tokens.expiry_date).toISOString();
		if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;

		await supabaseAdmin.from('email_connections').update(updateData).eq('id', connection.id);
	});

	return google.gmail({ version: 'v1', auth: client });
}

export type GmailMessage = {
	id: string;
	threadId: string;
	from: string;
	to: string;
	subject: string;
	snippet: string;
	date: string;
	isUnread: boolean;
	body?: string;
};

function decodeBase64Url(str: string): string {
	const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
	return Buffer.from(base64, 'base64').toString('utf-8');
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
	return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function getBodyText(payload: gmail_v1.Schema$MessagePart): string {
	if (payload.body?.data) {
		return decodeBase64Url(payload.body.data);
	}
	if (payload.parts) {
		// Prefer text/plain, fallback to text/html
		const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
		if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);

		const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
		if (htmlPart?.body?.data) return decodeBase64Url(htmlPart.body.data);

		// Recurse into multipart
		for (const part of payload.parts) {
			const result = getBodyText(part);
			if (result) return result;
		}
	}
	return '';
}

export function parseMessage(msg: gmail_v1.Schema$Message): GmailMessage {
	const headers = msg.payload?.headers ?? [];
	const labels: string[] = msg.labelIds ?? [];

	return {
		id: msg.id ?? '',
		threadId: msg.threadId ?? '',
		from: getHeader(headers, 'From'),
		to: getHeader(headers, 'To'),
		subject: getHeader(headers, 'Subject'),
		snippet: msg.snippet ?? '',
		date: getHeader(headers, 'Date'),
		isUnread: labels.includes('UNREAD'),
		body: getBodyText(msg.payload as gmail_v1.Schema$MessagePart)
	};
}

export type EmailAttachment = {
	filename: string;
	mimeType: string;
	content: Buffer;
};

export function buildRawEmail(
	from: string,
	to: string,
	subject: string,
	body: string,
	threadId?: string,
	attachments?: EmailAttachment[]
): string {
	if (!attachments || attachments.length === 0) {
		const headers = [
			`From: ${from}`,
			`To: ${to}`,
			`Subject: ${subject}`,
			'Content-Type: text/plain; charset="UTF-8"',
			'MIME-Version: 1.0'
		];

		if (threadId) {
			headers.push(`References: <${threadId}>`);
			headers.push(`In-Reply-To: <${threadId}>`);
		}

		const email = headers.join('\r\n') + '\r\n\r\n' + body;
		return Buffer.from(email).toString('base64url');
	}

	// Build multipart/mixed email with attachments
	const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

	const headers = [
		`From: ${from}`,
		`To: ${to}`,
		`Subject: ${subject}`,
		'MIME-Version: 1.0',
		`Content-Type: multipart/mixed; boundary="${boundary}"`
	];

	if (threadId) {
		headers.push(`References: <${threadId}>`);
		headers.push(`In-Reply-To: <${threadId}>`);
	}

	const parts: string[] = [];

	// Text body part
	parts.push(
		`--${boundary}\r\n` +
			'Content-Type: text/plain; charset="UTF-8"\r\n' +
			'Content-Transfer-Encoding: 7bit\r\n' +
			'\r\n' +
			body
	);

	// Attachment parts
	for (const attachment of attachments) {
		const base64Content = attachment.content.toString('base64');
		parts.push(
			`--${boundary}\r\n` +
				`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"\r\n` +
				'Content-Transfer-Encoding: base64\r\n' +
				`Content-Disposition: attachment; filename="${attachment.filename}"\r\n` +
				'\r\n' +
				base64Content
		);
	}

	const email = headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n') + `\r\n--${boundary}--`;
	return Buffer.from(email).toString('base64url');
}
