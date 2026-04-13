import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode } from '$lib/server/integrations/discord';
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
			provider: 'discord',
			status: 'active',
			access_token: tokens.accessToken,
			refresh_token: null,
			token_expires_at: null,
			scopes: ['webhook.incoming', 'bot'],
			external_account_id: tokens.guildId,
			external_account_name: tokens.guildName,
			config: {
				webhook_url: tokens.webhookUrl,
				webhook_id: tokens.webhookId,
				webhook_token: tokens.webhookToken,
				guild_id: tokens.guildId,
				guild_name: tokens.guildName,
				channel_id: tokens.channelId,
				notify_on: [
					'order_submitted',
					'order_confirmed',
					'order_shipped',
					'order_cancelled',
					'new_account'
				]
			},
			connected_by: locals.user.id,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'organization_id, provider' }
	);

	throw redirect(303, '/organization/integrations?connected=discord');
};
