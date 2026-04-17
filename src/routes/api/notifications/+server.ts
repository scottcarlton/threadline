import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { notifyOrgMembers } from '$lib/server/notifications.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { organization, user } = locals;
	if (!organization || !user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { type, title, body, link } = await request.json();
	if (!type || !title) {
		return json({ error: 'type and title are required' }, { status: 400 });
	}

	notifyOrgMembers(organization.id, user.id, {
		type,
		title,
		body: body ?? undefined,
		link: link ?? undefined
	});

	return json({ success: true });
};
