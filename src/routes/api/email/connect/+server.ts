import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUrl } from '$lib/server/gmail';
import { rememberReturnPath } from '$lib/server/oauth-return';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	// Started from preflight? Come back there instead of /settings. Kept in a
	// cookie because the callback verifies `state === user.id` exactly.
	rememberReturnPath(cookies, url.searchParams.get('return'), !url.hostname.includes('localhost'));

	const authUrl = getAuthUrl(locals.user.id);
	throw redirect(302, authUrl);
};
