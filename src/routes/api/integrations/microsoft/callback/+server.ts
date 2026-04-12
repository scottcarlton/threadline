import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode } from '$lib/server/integrations/microsoft/oauth';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const code = url.searchParams.get('code');
	const stateParam = url.searchParams.get('state');

	if (!code || !stateParam) {
		return new Response(JSON.stringify({ error: 'Missing code or state' }), { status: 400 });
	}

	let state: { userId: string; orgId: string };
	try {
		state = JSON.parse(stateParam);
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid state' }), { status: 400 });
	}

	if (state.userId !== locals.user.id) {
		return new Response(JSON.stringify({ error: 'State mismatch' }), { status: 400 });
	}

	const tokens = await exchangeCode(url.origin, code);

	await supabaseAdmin.from('integration_connections').upsert(
		{
			organization_id: state.orgId,
			provider: 'microsoft',
			status: 'active',
			access_token: tokens.accessToken,
			refresh_token: tokens.refreshToken,
			token_expires_at: tokens.expiresAt,
			scopes: ['Mail.Read', 'Mail.Send', 'ChannelMessage.Send', 'Files.ReadWrite'],
			external_account_id: tokens.email,
			external_account_name: `${tokens.displayName} (${tokens.email})`,
			config: {
				email: tokens.email,
				display_name: tokens.displayName,
				teams_team_id: null,
				teams_channel_id: null,
				notify_on: []
			},
			connected_by: locals.user.id,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'organization_id, provider' }
	);

	throw redirect(303, '/organization/integrations?connected=microsoft');
};
