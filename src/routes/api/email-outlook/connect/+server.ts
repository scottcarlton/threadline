import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOutlookAuthUrl } from '$lib/server/integrations/microsoft/outlook-user';
import { rememberReturnPath } from '$lib/server/oauth-return';
import crypto from 'crypto';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	rememberReturnPath(cookies, url.searchParams.get('return'), !url.hostname.includes('localhost'));

	const nonce = crypto.randomUUID();
	cookies.set('oauth_state', JSON.stringify({ userId: locals.user.id, nonce }), {
		path: '/',
		httpOnly: true,
		secure: !url.hostname.includes('localhost'),
		sameSite: 'lax',
		maxAge: 600
	});
	const state = JSON.stringify({ userId: locals.user.id, nonce });
	const authUrl = getOutlookAuthUrl(url.origin, state);
	throw redirect(302, authUrl);
};
