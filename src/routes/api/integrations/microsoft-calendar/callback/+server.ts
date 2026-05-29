import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeMsCalendarCode } from '$lib/server/integrations/microsoft/calendar-user';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (!code || !state) {
		return new Response(JSON.stringify({ error: 'Missing code or state' }), { status: 400 });
	}

	if (state !== locals.user.id) {
		return new Response(JSON.stringify({ error: 'State mismatch' }), { status: 400 });
	}

	const tokens = await exchangeMsCalendarCode(url.origin, code);

	await supabaseAdmin.from('email_connections').upsert(
		{
			profile_id: locals.user.id,
			provider: 'microsoft_calendar',
			email_address: tokens.email,
			access_token: tokens.accessToken,
			refresh_token: tokens.refreshToken,
			token_expires_at: tokens.expiresAt,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'profile_id, provider' }
	);

	throw redirect(303, '/settings?ms_calendar_connected=true');
};
