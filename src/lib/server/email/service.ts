import {
	getGmailClient,
	parseMessage,
	extractHtmlBody,
	buildRawEmail,
	type EmailAttachment
} from '$lib/server/gmail';
import {
	listUserMessages,
	getUserConversation,
	getUserUnreadCount,
	sendUserMail,
	replyUserMail
} from '$lib/server/integrations/microsoft/outlook-user-mail';
import { supabaseAdmin } from '$lib/server/supabase';

export type EmailProvider = 'gmail' | 'outlook';

export type InboxMessage = {
	id: string;
	threadId: string;
	from: string;
	to: string;
	subject: string;
	snippet: string;
	date: string;
	isUnread: boolean;
};

export type ThreadMessage = {
	id: string;
	from: string;
	to: string;
	subject: string;
	date: string;
	/** Raw body — HTML when bodyIsHtml is true, otherwise plain text. Sanitized client-side. */
	body: string;
	bodyIsHtml: boolean;
};

export type ListInboxOptions = {
	q?: string;
	/**
	 * Restrict to messages from/to these addresses.
	 * `null`/`undefined` → no contact filter (full inbox).
	 * `[]` → a filter is active but resolved to zero contacts → return nothing.
	 */
	contactEmails?: string[] | null;
};

export type SendEmailInput = {
	to: string;
	subject: string;
	body: string;
	/** Provider thread id (Gmail threadId / Outlook conversationId) for in-thread replies. */
	threadId?: string;
	/** Original message id to reply to — used by Outlook for proper threading. */
	inReplyTo?: string;
	attachments?: { filename: string; mimeType: string; content: string }[];
};

/** Resolve which email provider this user has connected (gmail preferred if both somehow exist). */
export async function getConnectedEmailProvider(
	profileId: string
): Promise<{ provider: EmailProvider; email: string } | null> {
	const { data } = await supabaseAdmin
		.from('email_connections')
		.select('provider, email_address')
		.eq('profile_id', profileId)
		.in('provider', ['gmail', 'outlook']);

	const rows = (data ?? []) as { provider: EmailProvider; email_address: string }[];
	if (rows.length === 0) return null;

	const chosen = rows.find((r) => r.provider === 'gmail') ?? rows[0];
	return { provider: chosen.provider, email: chosen.email_address };
}

function extractEmail(header: string): string {
	const match = header.match(/<(.+?)>/);
	return (match ? match[1] : header).trim().toLowerCase();
}

export async function listInbox(
	profileId: string,
	opts: ListInboxOptions = {}
): Promise<InboxMessage[]> {
	const conn = await getConnectedEmailProvider(profileId);
	if (!conn) return [];
	return conn.provider === 'gmail'
		? listGmailInbox(profileId, opts)
		: listOutlookInbox(profileId, opts);
}

async function listGmailInbox(profileId: string, { q, contactEmails }: ListInboxOptions) {
	const gmail = await getGmailClient(profileId);
	if (!gmail) return [];

	let searchQuery = '';
	if (contactEmails !== null && contactEmails !== undefined) {
		if (contactEmails.length === 0) return [];
		const fromClauses = contactEmails.map((e) => `from:${e}`).join(' OR ');
		const toClauses = contactEmails.map((e) => `to:${e}`).join(' OR ');
		searchQuery = `(${fromClauses} OR ${toClauses})`;
	}
	if (q) searchQuery = searchQuery ? `${searchQuery} ${q}` : q;

	const listRes = await gmail.users.messages.list({
		userId: 'me',
		q: searchQuery || 'in:inbox',
		maxResults: 30
	});

	const messageIds = listRes.data.messages ?? [];
	return Promise.all(
		messageIds.map(async (m) => {
			const msg = await gmail.users.messages.get({
				userId: 'me',
				id: m.id!,
				format: 'metadata',
				metadataHeaders: ['From', 'To', 'Subject', 'Date']
			});
			const p = parseMessage(msg.data);
			return {
				id: p.id,
				threadId: p.threadId,
				from: p.from,
				to: p.to,
				subject: p.subject,
				snippet: p.snippet,
				date: p.date,
				isUnread: p.isUnread
			};
		})
	);
}

async function listOutlookInbox(profileId: string, { q, contactEmails }: ListInboxOptions) {
	if (contactEmails !== null && contactEmails !== undefined && contactEmails.length === 0) {
		return [];
	}

	const raw = await listUserMessages(profileId, { top: 50 });
	let messages: InboxMessage[] = raw.map((m) => ({
		id: m.id,
		threadId: m.conversationId,
		from: m.from,
		to: m.to,
		subject: m.subject,
		snippet: m.bodyPreview,
		date: m.receivedDateTime,
		isUnread: !m.isRead
	}));

	if (contactEmails && contactEmails.length > 0) {
		const set = new Set(contactEmails.map((e) => e.toLowerCase()));
		messages = messages.filter((m) => set.has(extractEmail(m.from)) || set.has(extractEmail(m.to)));
	}

	if (q) {
		const needle = q.toLowerCase();
		messages = messages.filter(
			(m) =>
				m.subject.toLowerCase().includes(needle) ||
				m.from.toLowerCase().includes(needle) ||
				m.snippet.toLowerCase().includes(needle)
		);
	}

	return messages.slice(0, 30);
}

export async function getThread(profileId: string, threadId: string): Promise<ThreadMessage[]> {
	const conn = await getConnectedEmailProvider(profileId);
	if (!conn) return [];

	if (conn.provider === 'gmail') {
		const gmail = await getGmailClient(profileId);
		if (!gmail) return [];
		const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
		return (thread.data.messages ?? []).map((m) => {
			const p = parseMessage(m);
			const { content, isHtml } = extractHtmlBody(m.payload ?? undefined);
			return {
				id: p.id,
				from: p.from,
				to: p.to,
				subject: p.subject,
				date: p.date,
				body: content,
				bodyIsHtml: isHtml
			};
		});
	}

	const conversation = await getUserConversation(profileId, threadId);
	return conversation.map((m) => {
		const isHtml = !!m.body && m.bodyContentType === 'html';
		return {
			id: m.id,
			from: m.from,
			to: m.to,
			subject: m.subject,
			date: m.receivedDateTime,
			body: m.body ?? m.bodyPreview,
			bodyIsHtml: isHtml
		};
	});
}

export async function getUnreadCount(profileId: string): Promise<number> {
	const conn = await getConnectedEmailProvider(profileId);
	if (!conn) return 0;

	if (conn.provider === 'gmail') {
		const gmail = await getGmailClient(profileId);
		if (!gmail) return 0;
		const label = await gmail.users.labels.get({ userId: 'me', id: 'INBOX' });
		return label.data.messagesUnread ?? 0;
	}

	return getUserUnreadCount(profileId);
}

export async function sendEmail(
	profileId: string,
	input: SendEmailInput
): Promise<{ messageId: string; threadId: string | null }> {
	const conn = await getConnectedEmailProvider(profileId);
	if (!conn) throw new Error('Email not connected');

	if (conn.provider === 'gmail') {
		const gmail = await getGmailClient(profileId);
		if (!gmail) throw new Error('Email not connected');

		let emailAttachments: EmailAttachment[] | undefined;
		if (input.attachments?.length) {
			emailAttachments = input.attachments.map((a) => ({
				filename: a.filename,
				mimeType: a.mimeType,
				content: Buffer.from(a.content, 'base64')
			}));
		}

		const raw = buildRawEmail(
			conn.email,
			input.to,
			input.subject,
			input.body,
			input.threadId,
			emailAttachments
		);
		const res = await gmail.users.messages.send({
			userId: 'me',
			requestBody: { raw, threadId: input.threadId || undefined }
		});
		return { messageId: res.data.id ?? '', threadId: res.data.threadId ?? null };
	}

	// Outlook: reply in-thread when we have the original message id, otherwise send fresh.
	if (input.inReplyTo) {
		await replyUserMail(profileId, input.inReplyTo, input.body);
		return { messageId: '', threadId: input.threadId ?? null };
	}

	await sendUserMail(profileId, {
		to: input.to,
		subject: input.subject,
		body: input.body,
		attachments: input.attachments
	});
	return { messageId: '', threadId: null };
}
