import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, organization, orgType, membership } = locals;
	if (!session || !organization) return json({ error: 'Unauthorized' }, { status: 401 });
	if (orgType !== 'brand') return json({ error: 'Only brand orgs' }, { status: 403 });
	if (!membership || !['admin', 'owner'].includes(membership.role))
		return json({ error: 'Admin or owner required' }, { status: 403 });

	const { connectionId, commission_rate } = await request.json();
	if (!connectionId) return json({ error: 'Connection ID required' }, { status: 400 });

	const rate = commission_rate === null || commission_rate === '' ? null : Number(commission_rate);
	if (rate !== null && (Number.isNaN(rate) || rate < 0 || rate > 100))
		return json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 });

	const { data, error } = await supabaseAdmin
		.from('org_connections')
		.update({ commission_rate: rate })
		.eq('id', connectionId)
		.eq('brand_org_id', organization.id)
		.select()
		.single();

	if (error || !data) return json({ error: 'Not found' }, { status: 404 });
	return json({ connection: data });
};
