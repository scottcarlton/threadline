import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeOutlookCode } from '$lib/server/integrations/microsoft/outlook-user';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (!code || !state) {
		return new Response(JSON.stringify({ error: 'Missing code or state' }), { status: 400 });
	}

	const cookieState = cookies.get('oauth_state');
	cookies.delete('oauth_state', { path: '/' });
	if (!cookieState || cookieState !== state) {
		return new Response(JSON.stringify({ error: 'State mismatch' }), { status: 400 });
	}
	let parsed: { userId?: string; nonce?: string };
	try {
		parsed = JSON.parse(state);
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid state' }), { status: 400 });
	}
	if (parsed.userId !== locals.user.id) {
		return new Response(JSON.stringify({ error: 'State mismatch' }), { status: 400 });
	}

	const tokens = await exchangeOutlookCode(url.origin, code);

	await supabaseAdmin.from('email_connections').upsert(
		{
			profile_id: locals.user.id,
			provider: 'outlook',
			email_address: tokens.email,
			access_token: tokens.accessToken,
			refresh_token: tokens.refreshToken,
			token_expires_at: tokens.expiresAt,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'profile_id, provider' }
	);

	throw redirect(303, '/settings?outlook_connected=true');
};
