import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUrl } from '$lib/server/integrations/google-calendar';
import crypto from 'crypto';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const nonce = crypto.randomUUID();
	cookies.set('oauth_state', JSON.stringify({ userId: locals.user.id, nonce }), {
		path: '/',
		httpOnly: true,
		secure: !url.hostname.includes('localhost'),
		sameSite: 'lax',
		maxAge: 600
	});
	const state = JSON.stringify({ userId: locals.user.id, nonce });
	const authUrl = getAuthUrl(url.origin, state);
	throw redirect(302, authUrl);
};
