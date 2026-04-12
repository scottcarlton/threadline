import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGmailClient, parseMessage } from '$lib/server/gmail';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const gmail = await getGmailClient(locals.user.id);
	if (!gmail) {
		return json({ error: 'Gmail not connected' }, { status: 400 });
	}

	const thread = await gmail.users.threads.get({
		userId: 'me',
		id: params.id,
		format: 'full'
	});

	const messages = (thread.data.messages ?? []).map((msg) => parseMessage(msg));

	return json({ messages });
};
