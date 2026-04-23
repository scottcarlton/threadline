import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode } from '$lib/server/integrations/shopify';
import { supabaseAdmin } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';

// v1: no callback HMAC verification. Shopify's callback query params are signed with an hmac parameter;
// verification uses the query string sans the hmac key. Revisit before production scaling.
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session || !locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const code = url.searchParams.get('code');
	const stateParam = url.searchParams.get('state');

	if (!code || !stateParam) {
		return new Response(JSON.stringify({ error: 'Missing code or state' }), { status: 400 });
	}

	let state: { userId: string; orgId: string; shop: string };
	try {
		state = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'));
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid state' }), { status: 400 });
	}

	if (state.userId !== locals.user.id) {
		return new Response(JSON.stringify({ error: 'State mismatch' }), { status: 400 });
	}

	const tokens = await exchangeCode({ shop: state.shop, code });

	await supabaseAdmin.from('integration_connections').upsert(
		{
			organization_id: state.orgId,
			provider: 'shopify',
			status: 'active',
			access_token: tokens.accessToken,
			refresh_token: null,
			token_expires_at: null,
			scopes: tokens.scope ? tokens.scope.split(',') : [],
			external_account_id: state.shop,
			external_account_name: state.shop,
			config: {
				shop: state.shop,
				api_version: env.SHOPIFY_API_VERSION ?? '2025-10'
			},
			connected_by: locals.user.id,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'organization_id, provider' }
	);

	throw redirect(303, '/organization/integrations?connected=shopify');
};
