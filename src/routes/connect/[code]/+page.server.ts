import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { code } = params;

	const { data: invite } = await supabaseAdmin
		.from('connection_invites')
		.select(
			'id, code, expires_at, max_uses, use_count, auto_approve, organizations:brand_org_id(id, name, slug, logo_url)'
		)
		.eq('code', code)
		.maybeSingle();

	const now = new Date();
	let status: 'ok' | 'expired' | 'maxed' | 'not_found' = 'ok';
	if (!invite) status = 'not_found';
	else if (new Date(invite.expires_at) < now) status = 'expired';
	else if (invite.max_uses > 0 && invite.use_count >= invite.max_uses) status = 'maxed';

	// Brand info is safe to show even for expired codes — helps the visitor identify who invited them.
	const brand =
		(
			invite as {
				organizations?: {
					id: string;
					name: string;
					slug: string | null;
					logo_url: string | null;
				};
			} | null
		)?.organizations ?? null;

	const autoApprove = Boolean(invite?.auto_approve);

	// /connect is a public route — hooks.server.ts skips loading membership/org data.
	// Query the user's membership directly when they have a session.
	let repBrands: Array<{ id: string; name: string }> = [];
	let canConnect = false;
	let orgType: string | null = null;
	const session = locals.session;

	if (session) {
		const { data: membership } = await supabaseAdmin
			.from('organization_members')
			.select('id, role, organization_id, organizations(id, org_type)')
			.eq('profile_id', session.user.id)
			.limit(1)
			.single();

		if (membership) {
			const org = membership.organizations as
				| { id: string; org_type: string }
				| { id: string; org_type: string }[]
				| null;
			const orgData = Array.isArray(org) ? org[0] : org;
			orgType = orgData?.org_type ?? null;

			if (orgType === 'rep' && ['admin', 'owner'].includes(membership.role as string)) {
				canConnect = true;
				const { data: brands } = await supabaseAdmin
					.from('brands')
					.select('id, name')
					.eq('organization_id', membership.organization_id)
					.eq('is_active', true)
					.order('name');
				repBrands = brands ?? [];
			}
		}
	}

	return {
		code,
		status,
		brand,
		autoApprove,
		canConnect,
		isLoggedIn: Boolean(session),
		orgType,
		repBrands
	};
};
