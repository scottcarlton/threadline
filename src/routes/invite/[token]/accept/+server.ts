import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		throw redirect(303, `/invite/${params.token}`);
	}

	const userId = session.user.id;
	const token = params.token;

	// Look up the invitation
	const { data: invitation } = await supabaseAdmin
		.from('invitations')
		.select('*')
		.eq('token', token)
		.is('accepted_at', null)
		.single();

	if (!invitation) {
		throw redirect(303, '/login?error=invitation_invalid');
	}

	if (new Date(invitation.expires_at) < new Date()) {
		throw redirect(303, '/login?error=invitation_expired');
	}

	// Create organization membership
	const { error: memberError } = await supabaseAdmin.from('organization_members').insert({
		organization_id: invitation.organization_id,
		profile_id: userId,
		role: invitation.role,
		invited_by: invitation.invited_by,
		accepted_at: new Date().toISOString()
	});

	if (memberError) {
		throw redirect(303, '/login?error=invite_accept_failed');
	}

	// If invitation specifies brand scoping, create brand access entries
	if (invitation.brand_ids && invitation.brand_ids.length > 0) {
		const { data: member } = await supabaseAdmin
			.from('organization_members')
			.select('id')
			.eq('organization_id', invitation.organization_id)
			.eq('profile_id', userId)
			.single();

		if (member) {
			const brandAccessRows = invitation.brand_ids.map((brandId: string) => ({
				member_id: member.id,
				brand_id: brandId,
				granted_by: invitation.invited_by
			}));
			await supabaseAdmin.from('member_brand_access').insert(brandAccessRows);
		}
	}

	// Mark invitation as accepted
	await supabaseAdmin
		.from('invitations')
		.update({ accepted_at: new Date().toISOString() })
		.eq('id', invitation.id);

	throw redirect(303, '/insight');
};
