import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { checkConnectionLimit } from '$lib/server/billing/entitlements.js';

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

	// Plan limits (SCO-47). Scoped to this brand org, so another org's id
	// finds nothing and falls through to the update's own 404.
	const { data: pending } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id')
		.eq('id', connectionId)
		.eq('brand_org_id', organization.id)
		.eq('status', 'pending')
		.maybeSingle();
	if (pending) {
		const limit = await checkConnectionLimit(
			supabaseAdmin,
			{ repOrgId: pending.rep_org_id, brandOrgId: organization.id },
			'brand'
		);
		if (!limit.ok) return json({ error: limit.message }, { status: 402 });
	}

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

	locals.audit.record('connection.accepted', {
		subjectId: connection.id
	});

	return json({ connection });
};
