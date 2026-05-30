import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode, getAccountEmail } from '$lib/server/integrations/google-calendar';
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

	const tokens = await exchangeCode(url.origin, code);
	const email = await getAccountEmail(url.origin, tokens.access_token!);

	await supabaseAdmin.from('email_connections').upsert(
		{
			profile_id: locals.user.id,
			provider: 'google_calendar',
			email_address: email,
			access_token: tokens.access_token ?? '',
			refresh_token: tokens.refresh_token ?? '',
			token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'profile_id, provider' }
	);

	throw redirect(303, '/settings?calendar_connected=true');
};
