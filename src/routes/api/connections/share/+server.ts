import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { shareConnectInvite } from '$lib/server/connections.js';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const { session, organization, orgType, membership } = locals;
	if (!session || !organization) return json({ error: 'Unauthorized' }, { status: 401 });
	if (orgType !== 'brand')
		return json({ error: 'Only brand orgs can share connect links' }, { status: 403 });
	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Admin or owner required' }, { status: 403 });
	}

	const body = await request.json().catch(() => ({}));
	const commissionRate = Math.max(0, Math.min(100, Number(body.commissionRate) || 0));

	const invite = await shareConnectInvite(supabaseAdmin, organization.id, commissionRate);

	return json({
		code: invite.code,
		url: `${url.origin}/connect/${invite.code}`,
		commissionRate: invite.commission_rate
	});
};
