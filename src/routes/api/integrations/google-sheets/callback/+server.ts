import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode, getAccountEmail } from '$lib/server/integrations/google-sheets';
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
	const email = await getAccountEmail(url.origin, tokens.access_token!);

	await supabaseAdmin.from('integration_connections').upsert(
		{
			organization_id: state.orgId,
			provider: 'google_sheets',
			status: 'active',
			access_token: tokens.access_token ?? '',
			refresh_token: tokens.refresh_token ?? '',
			token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
			scopes: ['spreadsheets', 'drive.file'],
			external_account_id: email,
			external_account_name: email,
			config: {},
			connected_by: locals.user.id,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'organization_id, provider' }
	);

	throw redirect(303, '/organization/integrations?connected=google_sheets');
};
