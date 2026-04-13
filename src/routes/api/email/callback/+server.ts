import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode, getOAuthClient } from '$lib/server/gmail';
import { google } from 'googleapis';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (!code || !state) {
		return new Response(JSON.stringify({ error: 'Missing code or state parameter' }), {
			status: 400
		});
	}

	// Verify state matches the current user's profile ID
	if (state !== locals.user.id) {
		return new Response(JSON.stringify({ error: 'Invalid state parameter' }), { status: 400 });
	}

	const tokens = await exchangeCode(code);

	// Get user's Gmail email address
	const client = getOAuthClient();
	client.setCredentials(tokens);
	const gmail = google.gmail({ version: 'v1', auth: client });
	const profile = await gmail.users.getProfile({ userId: 'me' });
	const emailAddress = profile.data.emailAddress ?? '';

	// Upsert tokens into email_connections
	await supabaseAdmin.from('email_connections').upsert(
		{
			profile_id: locals.user.id,
			provider: 'gmail',
			email_address: emailAddress,
			access_token: tokens.access_token ?? '',
			refresh_token: tokens.refresh_token ?? '',
			token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'profile_id, provider' }
	);

	throw redirect(303, '/settings?email_connected=true');
};
