import { graphFetch } from './oauth.js';

export type OutlookMessage = {
	id: string;
	subject: string;
	from: string;
	to: string;
	receivedDateTime: string;
	bodyPreview: string;
	isRead: boolean;
	body?: string;
};

type GraphMessage = {
	id: string;
	subject?: string | null;
	from?: { emailAddress?: { address?: string | null } | null } | null;
	toRecipients?: { emailAddress?: { address?: string | null } | null }[] | null;
	receivedDateTime: string;
	bodyPreview?: string | null;
	isRead?: boolean | null;
	body?: { content?: string | null } | null;
};

export async function listMessages(
	organizationId: string,
	options?: { top?: number; folder?: string }
): Promise<OutlookMessage[]> {
	const top = options?.top ?? 20;
	const folder = options?.folder ?? 'inbox';

	const data = await graphFetch<{ value: GraphMessage[] }>(
		organizationId,
		`/me/mailFolders/${folder}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead`
	);

	if (!data?.value) return [];

	return data.value.map((msg) => ({
		id: msg.id,
		subject: msg.subject ?? '',
		from: msg.from?.emailAddress?.address ?? '',
		to: msg.toRecipients?.[0]?.emailAddress?.address ?? '',
		receivedDateTime: msg.receivedDateTime,
		bodyPreview: msg.bodyPreview ?? '',
		isRead: msg.isRead ?? true
	}));
}

export async function getMessage(
	organizationId: string,
	messageId: string
): Promise<OutlookMessage | null> {
	const msg = await graphFetch<GraphMessage>(organizationId, `/me/messages/${messageId}`);
	if (!msg) return null;

	return {
		id: msg.id,
		subject: msg.subject ?? '',
		from: msg.from?.emailAddress?.address ?? '',
		to: msg.toRecipients?.[0]?.emailAddress?.address ?? '',
		receivedDateTime: msg.receivedDateTime,
		bodyPreview: msg.bodyPreview ?? '',
		isRead: msg.isRead ?? true,
		body: msg.body?.content ?? ''
	};
}

export async function sendMail(
	organizationId: string,
	to: string,
	subject: string,
	body: string,
	contentType: 'Text' | 'HTML' = 'Text'
): Promise<boolean> {
	try {
		await graphFetch(organizationId, '/me/sendMail', {
			method: 'POST',
			body: JSON.stringify({
				message: {
					subject,
					body: { contentType, content: body },
					toRecipients: [{ emailAddress: { address: to } }]
				}
			})
		});
		return true;
	} catch {
		return false;
	}
}
