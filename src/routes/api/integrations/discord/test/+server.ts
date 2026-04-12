import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendDiscordMessage } from '$lib/server/integrations/discord';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const sent = await sendDiscordMessage(locals.organization!.id, {
		title: 'Test Notification',
		text: 'Threadline is connected and working!'
	});

	if (!sent) {
		return json({ error: 'Failed to send test message' }, { status: 500 });
	}

	return json({ success: true });
};
