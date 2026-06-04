import { getOutlookUserToken } from './outlook-user.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export type OutlookUserMessage = {
	id: string;
	conversationId: string;
	subject: string;
	/** "Display Name <address>" when a name is present, otherwise the bare address. */
	from: string;
	to: string;
	receivedDateTime: string;
	bodyPreview: string;
	isRead: boolean;
	body?: string;
	bodyContentType?: 'html' | 'text';
};

type GraphAddress = { emailAddress?: { name?: string | null; address?: string | null } | null };

type GraphMessage = {
	id: string;
	conversationId?: string | null;
	subject?: string | null;
	from?: GraphAddress | null;
	toRecipients?: GraphAddress[] | null;
	receivedDateTime: string;
	bodyPreview?: string | null;
	isRead?: boolean | null;
	body?: { contentType?: string | null; content?: string | null } | null;
};

/** Format a Graph address as "Name <address>" so the client's From-header parser can split it. */
function formatAddress(addr?: GraphAddress | null): string {
	const email = addr?.emailAddress?.address ?? '';
	const name = addr?.emailAddress?.name ?? '';
	if (name && name !== email) return `${name} <${email}>`;
	return email;
}

/** Map a raw Graph message into our normalized shape. Pure — exported for testing. */
export function mapGraphMessage(msg: GraphMessage): OutlookUserMessage {
	return {
		id: msg.id,
		conversationId: msg.conversationId ?? msg.id,
		subject: msg.subject ?? '',
		from: formatAddress(msg.from),
		to: formatAddress(msg.toRecipients?.[0]),
		receivedDateTime: msg.receivedDateTime,
		bodyPreview: msg.bodyPreview ?? '',
		isRead: msg.isRead ?? true,
		body: msg.body?.content ?? undefined,
		bodyContentType: msg.body?.contentType === 'html' ? 'html' : 'text'
	};
}

/** Split a comma-separated recipient list into Graph recipient objects. Pure — exported for testing. */
export function parseRecipients(to: string): { emailAddress: { address: string } }[] {
	return to
		.split(',')
		.map((e) => e.trim())
		.filter(Boolean)
		.map((address) => ({ emailAddress: { address } }));
}

async function graphUserFetch<T = unknown>(
	profileId: string,
	path: string,
	options?: RequestInit
): Promise<T | null> {
	const token = await getOutlookUserToken(profileId);
	if (!token) return null;

	const res = await fetch(`${GRAPH}${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...options?.headers
		}
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(`Graph API error: ${err.error?.message ?? res.statusText}`);
	}

	// sendMail / reply return 202 Accepted with no body.
	if (res.status === 202 || res.status === 204) return null;

	const text = await res.text();
	return text ? (JSON.parse(text) as T) : null;
}

export async function listUserMessages(
	profileId: string,
	options?: { top?: number; folder?: string }
): Promise<OutlookUserMessage[]> {
	const top = options?.top ?? 30;
	const folder = options?.folder ?? 'inbox';

	const data = await graphUserFetch<{ value: GraphMessage[] }>(
		profileId,
		`/me/mailFolders/${folder}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead`
	);

	return (data?.value ?? []).map(mapGraphMessage);
}

export async function getUserConversation(
	profileId: string,
	conversationId: string
): Promise<OutlookUserMessage[]> {
	const params = new URLSearchParams();
	params.set('$filter', `conversationId eq '${conversationId.replace(/'/g, "''")}'`);
	params.set(
		'$select',
		'id,conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview,body,isRead'
	);

	// Graph returns HTML bodies by default; the thread view sanitizes and renders
	// them as rich HTML, so no Prefer header is needed.
	const data = await graphUserFetch<{ value: GraphMessage[] }>(
		profileId,
		`/me/messages?${params.toString()}`
	);

	// Graph rejects $orderby alongside a conversationId $filter, so sort oldest-first here.
	return (data?.value ?? [])
		.map(mapGraphMessage)
		.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));
}

export async function getUserUnreadCount(profileId: string): Promise<number> {
	const data = await graphUserFetch<{ unreadItemCount?: number }>(
		profileId,
		'/me/mailFolders/inbox?$select=unreadItemCount'
	);
	return data?.unreadItemCount ?? 0;
}

export async function sendUserMail(
	profileId: string,
	input: {
		to: string;
		subject: string;
		body: string;
		attachments?: { filename: string; mimeType: string; content: string }[];
	}
): Promise<void> {
	const message: Record<string, unknown> = {
		subject: input.subject,
		body: { contentType: 'Text', content: input.body },
		toRecipients: parseRecipients(input.to)
	};

	if (input.attachments?.length) {
		message.attachments = input.attachments.map((a) => ({
			'@odata.type': '#microsoft.graph.fileAttachment',
			name: a.filename,
			contentType: a.mimeType,
			contentBytes: a.content
		}));
	}

	await graphUserFetch(profileId, '/me/sendMail', {
		method: 'POST',
		body: JSON.stringify({ message, saveToSentItems: true })
	});
}

export async function replyUserMail(
	profileId: string,
	messageId: string,
	body: string
): Promise<void> {
	await graphUserFetch(profileId, `/me/messages/${encodeURIComponent(messageId)}/reply`, {
		method: 'POST',
		body: JSON.stringify({ comment: body })
	});
}
