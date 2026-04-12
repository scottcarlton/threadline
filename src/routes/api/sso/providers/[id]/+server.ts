import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

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

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const orgId = locals.organization!.id;

	const { data: existing } = await supabaseAdmin
		.from('organization_sso_providers')
		.select('*')
		.eq('id', params.id)
		.eq('organization_id', orgId)
		.single();

	if (!existing) {
		return json({ error: 'SSO provider not found' }, { status: 404 });
	}

	const { metadataUrl, displayName, domain } = await request.json();
	const normalizedDomain = domain?.toLowerCase().trim() || existing.domain;

	// Update in Supabase auth via REST API
	const updatePayload: Record<string, unknown> = {};
	if (metadataUrl) updatePayload.metadata_url = metadataUrl;
	if (domain) updatePayload.domains = [normalizedDomain];

	if (Object.keys(updatePayload).length > 0) {
		try {
			await supabaseAuthAdmin('PUT', `/sso/providers/${existing.supabase_provider_id}`, updatePayload);
		} catch (err: any) {
			return json({ error: err.message }, { status: 500 });
		}
	}

	// Update our record
	const { data: updated, error: updateError } = await supabaseAdmin
		.from('organization_sso_providers')
		.update({
			domain: normalizedDomain,
			display_name: displayName ?? existing.display_name,
			metadata_url: metadataUrl ?? existing.metadata_url,
			updated_at: new Date().toISOString()
		})
		.eq('id', params.id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (updateError) {
		return json({ error: updateError.message }, { status: 500 });
	}

	return json({ provider: updated });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const orgId = locals.organization!.id;

	const { data: existing } = await supabaseAdmin
		.from('organization_sso_providers')
		.select('*')
		.eq('id', params.id)
		.eq('organization_id', orgId)
		.single();

	if (!existing) {
		return json({ error: 'SSO provider not found' }, { status: 404 });
	}

	// Delete from Supabase auth
	try {
		await supabaseAuthAdmin('DELETE', `/sso/providers/${existing.supabase_provider_id}`);
	} catch (err: any) {
		return json({ error: err.message }, { status: 500 });
	}

	// Delete from our table
	await supabaseAdmin
		.from('organization_sso_providers')
		.delete()
		.eq('id', params.id);

	// Auto-disable enforcement to prevent lockout
	await supabaseAdmin
		.from('organizations')
		.update({ sso_enforced: false })
		.eq('id', orgId);

	return json({ success: true });
};
