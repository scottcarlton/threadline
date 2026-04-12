import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, organization, membership } = locals;
	if (!session || !organization) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Admin or owner required' }, { status: 403 });
	}

	const { connectionId } = await request.json();
	if (!connectionId) return json({ error: 'Connection ID required' }, { status: 400 });

	// Verify user's org is part of this connection
	const { data: connection } = await supabaseAdmin
		.from('org_connections')
		.select('id, rep_org_id, brand_org_id')
		.eq('id', connectionId)
		.single();

	if (!connection) return json({ error: 'Connection not found' }, { status: 404 });
	if (connection.rep_org_id !== organization.id && connection.brand_org_id !== organization.id) {
		return json({ error: 'Not authorized for this connection' }, { status: 403 });
	}

	// Disconnect
	await supabaseAdmin
		.from('org_connections')
		.update({
			status: 'disconnected',
			disconnected_at: new Date().toISOString()
		})
		.eq('id', connectionId);

	// Revoke federated links (preserve historical data)
	await supabaseAdmin
		.from('federated_order_links')
		.update({ status: 'revoked' })
		.eq('connection_id', connectionId);

	return json({ success: true });
};
