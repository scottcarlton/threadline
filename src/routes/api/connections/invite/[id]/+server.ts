import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { session, organization, orgType, membership } = locals;
	if (!session || !organization) return json({ error: 'Unauthorized' }, { status: 401 });
	if (orgType !== 'brand') return json({ error: 'Only brand orgs' }, { status: 403 });
	if (!membership || !['admin', 'owner'].includes(membership.role))
		return json({ error: 'Admin or owner required' }, { status: 403 });

	const { id } = params;
	if (!id) return json({ error: 'Invite ID required' }, { status: 400 });

	const { error } = await supabaseAdmin
		.from('connection_invites')
		.delete()
		.eq('id', id)
		.eq('brand_org_id', organization.id);

	if (error) return json({ error: error.message }, { status: 500 });
	return json({ ok: true });
};
