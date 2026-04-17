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

	// If the visitor is logged in as a rep admin, give them the brand list they can map to.
	let repBrands: Array<{ id: string; name: string }> = [];
	let canConnect = false;
	if (
		locals.session &&
		locals.organization &&
		locals.orgType === 'rep' &&
		locals.membership &&
		['admin', 'owner'].includes(locals.membership.role)
	) {
		canConnect = true;
		const { data: brands } = await locals.supabase
			.from('brands')
			.select('id, name')
			.eq('organization_id', locals.organization.id)
			.eq('is_active', true)
			.order('name');
		repBrands = brands ?? [];
	}

	return {
		code,
		status,
		brand,
		autoApprove,
		canConnect,
		isLoggedIn: Boolean(locals.session),
		orgType: locals.orgType ?? null,
		repBrands
	};
};
