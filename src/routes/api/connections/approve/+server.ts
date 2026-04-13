import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, organization, orgType, membership } = locals;
	if (!session || !organization) return json({ error: 'Unauthorized' }, { status: 401 });
	if (orgType !== 'brand')
		return json({ error: 'Only brand orgs can approve connections' }, { status: 403 });
	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Admin or owner required' }, { status: 403 });
	}

	const { connectionId } = await request.json();
	if (!connectionId) return json({ error: 'Connection ID required' }, { status: 400 });

	const { data: connection, error } = await supabaseAdmin
		.from('org_connections')
		.update({
			status: 'active',
			approved_by: session.user.id,
			connected_at: new Date().toISOString()
		})
		.eq('id', connectionId)
		.eq('brand_org_id', organization.id)
		.eq('status', 'pending')
		.select()
		.single();

	if (error || !connection)
		return json({ error: 'Connection not found or already processed' }, { status: 404 });

	return json({ connection });
};
