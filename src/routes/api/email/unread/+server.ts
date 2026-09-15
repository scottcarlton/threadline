import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUnreadCount } from '$lib/server/email/service';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		return json({ count: 0 });
	}

	try {
		const count = await getUnreadCount(locals.user.id);
		return json({ count });
	} catch {
		return json({ count: 0 });
	}
};
