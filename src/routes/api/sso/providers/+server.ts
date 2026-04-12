import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Supabase SSO admin API helper (not available in the JS SDK)
async function supabaseAuthAdmin(method: string, path: string, body?: unknown) {
	const res = await fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/admin${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
			apikey: SUPABASE_SERVICE_ROLE_KEY
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json();
	if (!res.ok) {
		throw new Error(data.message || data.msg || 'SSO admin API error');
	}
	return data;
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const orgId = locals.organization!.id;

	const { data: providers, error } = await supabaseAdmin
		.from('organization_sso_providers')
		.select('*')
		.eq('organization_id', orgId)
		.order('created_at', { ascending: true });

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ providers });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const orgId = locals.organization!.id;
	const { domain, metadataUrl, displayName } = await request.json();

	if (!domain || !metadataUrl) {
		return json({ error: 'Domain and metadata URL are required' }, { status: 400 });
	}

	const normalizedDomain = domain.toLowerCase().trim();

	// Create SSO provider via Supabase auth admin REST API
	let ssoProvider: { id: string };
	try {
		ssoProvider = await supabaseAuthAdmin('POST', '/sso/providers', {
			type: 'saml',
			metadata_url: metadataUrl,
			domains: [normalizedDomain]
		});
	} catch (err: any) {
		return json({ error: err.message }, { status: 500 });
	}

	// Store mapping in our table
	const { data: record, error: insertError } = await supabaseAdmin
		.from('organization_sso_providers')
		.insert({
			organization_id: orgId,
			supabase_provider_id: ssoProvider.id,
			domain: normalizedDomain,
			display_name: displayName || null,
			metadata_url: metadataUrl,
			created_by: locals.user.id
		})
		.select()
		.single();

	if (insertError) {
		// Clean up the Supabase SSO provider
		try {
			await supabaseAuthAdmin('DELETE', `/sso/providers/${ssoProvider.id}`);
		} catch { /* best effort */ }
		return json({ error: insertError.message }, { status: 500 });
	}

	return json({ provider: record }, { status: 201 });
};
