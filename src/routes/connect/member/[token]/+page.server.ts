import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { token } = params;

	const { data: invite } = await supabaseAdmin
		.from('connection_member_invites')
		.select(
			'id, token, target_email, territory_ids, manages_others, expires_at, accepted_at, org_connection_id'
		)
		.eq('token', token)
		.maybeSingle();

	const now = new Date();
	let status: 'ok' | 'not_found' | 'accepted' | 'expired' = 'ok';
	if (!invite) status = 'not_found';
	else if (invite.accepted_at) status = 'accepted';
	else if (new Date(invite.expires_at) < now) status = 'expired';

	let brand: { id: string; name: string; logo_url: string | null } | null = null;
	let repOrgName: string | null = null;
	let territories: Array<{ id: string; name: string }> = [];
	let viewerIsMemberOfRepOrg = false;
	let viewerProfileMatchesInviteEmail = false;

	if (invite && status === 'ok') {
		const { data: connection } = await supabaseAdmin
			.from('org_connections')
			.select(
				'id, rep_org_id, brand_org_id, brand:brand_org_id(id, name, logo_url), rep:rep_org_id(name)'
			)
			.eq('id', invite.org_connection_id)
			.maybeSingle();

		const brandRow = connection?.brand as
			| { id: string; name: string; logo_url: string | null }
			| { id: string; name: string; logo_url: string | null }[]
			| null
			| undefined;
		brand = (Array.isArray(brandRow) ? brandRow[0] : brandRow) ?? null;

		const repRow = connection?.rep as { name?: string } | { name?: string }[] | null | undefined;
		const repData = Array.isArray(repRow) ? repRow[0] : repRow;
		repOrgName = repData?.name ?? null;

		if (invite.territory_ids?.length) {
			const { data: terr } = await supabaseAdmin
				.from('territories')
				.select('id, name')
				.in('id', invite.territory_ids);
			territories = (terr ?? []) as Array<{ id: string; name: string }>;
		}

		// Does the signed-in viewer actually belong to the rep side of this
		// connection? And does their email match the invite?
		const session = locals.session;
		if (session && connection) {
			const { data: repMember } = await supabaseAdmin
				.from('organization_members')
				.select('id')
				.eq('organization_id', connection.rep_org_id)
				.eq('profile_id', session.user.id)
				.maybeSingle();
			viewerIsMemberOfRepOrg = Boolean(repMember);
			const viewerEmail = session.user.email?.toLowerCase();
			viewerProfileMatchesInviteEmail = Boolean(viewerEmail && viewerEmail === invite.target_email);
		}
	}

	return {
		token,
		status,
		invite: invite
			? {
					target_email: invite.target_email,
					manages_others: invite.manages_others,
					territory_ids: invite.territory_ids ?? []
				}
			: null,
		brand,
		repOrgName,
		territories,
		isLoggedIn: Boolean(locals.session),
		viewerIsMemberOfRepOrg,
		viewerProfileMatchesInviteEmail
	};
};
