import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getThread } from '$lib/server/email/service';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const messages = await getThread(locals.user.id, params.id);
		return json({ messages });
	} catch (err) {
		console.error('Thread fetch error:', err);
		return json({ messages: [], error: 'Failed to fetch thread' });
	}
};
