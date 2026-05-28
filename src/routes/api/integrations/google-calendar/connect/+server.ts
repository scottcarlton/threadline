import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUrl } from '$lib/server/integrations/google-calendar';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const state = locals.user.id;
	const authUrl = getAuthUrl(url.origin, state);
	throw redirect(302, authUrl);
};
