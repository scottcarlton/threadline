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
	const managesOthers = body.managesOthers === true;
	const rawTerritoryIds = Array.isArray(body.territoryIds) ? (body.territoryIds as string[]) : [];

	// Every territory_id must belong to this brand org. Same validation
	// pattern as /api/connections/invite-member.
	if (rawTerritoryIds.length > 0) {
		const { data: territories } = await supabaseAdmin
			.from('territories')
			.select('id, organization_id')
			.in('id', rawTerritoryIds);
		const badTerritory = (territories ?? []).find(
			(t: { organization_id: string }) => t.organization_id !== organization.id
		);
		if (badTerritory || (territories?.length ?? 0) !== rawTerritoryIds.length) {
			return json(
				{ error: 'One or more territories do not belong to your organization' },
				{ status: 400 }
			);
		}
	}

	const invite = await shareConnectInvite(supabaseAdmin, organization.id, commissionRate, {
		managesOthers,
		territoryIds: rawTerritoryIds
	});

	return json({
		code: invite.code,
		url: `${url.origin}/connect/${invite.code}`,
		commissionRate: invite.commission_rate,
		managesOthers: invite.manages_others,
		territoryIds: invite.territory_ids
	});
};
