import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGmailClient } from '$lib/server/gmail';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		return json({ count: 0 });
	}

	try {
		const gmail = await getGmailClient(locals.user.id);
		if (!gmail) return json({ count: 0 });

		const label = await gmail.users.labels.get({
			userId: 'me',
			id: 'INBOX'
		});

		return json({ count: label.data.messagesUnread ?? 0 });
	} catch {
		return json({ count: 0 });
	}
};
