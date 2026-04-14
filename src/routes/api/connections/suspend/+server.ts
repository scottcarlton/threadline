import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, organization, orgType, membership } = locals;
	if (!session || !organization) return json({ error: 'Unauthorized' }, { status: 401 });
	if (orgType !== 'brand') return json({ error: 'Only brand orgs' }, { status: 403 });
	if (!membership || !['admin', 'owner'].includes(membership.role))
		return json({ error: 'Admin or owner required' }, { status: 403 });

	const { connectionId } = await request.json();
	if (!connectionId) return json({ error: 'Connection ID required' }, { status: 400 });

	const { data, error } = await supabaseAdmin
		.from('org_connections')
		.update({ status: 'suspended', disconnected_at: new Date().toISOString() })
		.eq('id', connectionId)
		.eq('brand_org_id', organization.id)
		.in('status', ['active', 'pending'])
		.select()
		.single();

	if (error || !data) return json({ error: 'Not found or not suspendable' }, { status: 404 });
	return json({ connection: data });
};
