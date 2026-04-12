import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUrl } from '$lib/server/gmail';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const authUrl = getAuthUrl(locals.user.id);
	throw redirect(302, authUrl);
};
