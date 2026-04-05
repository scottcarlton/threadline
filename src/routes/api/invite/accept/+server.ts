import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request }) => {
	const { token, userId } = await request.json();

	if (!token || !userId) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	// Look up the invitation
	const { data: invitation, error: invError } = await supabaseAdmin
		.from('invitations')
		.select('*')
		.eq('token', token)
		.is('accepted_at', null)
		.single();

	if (invError || !invitation) {
		return json({ error: 'Invitation not found or already used' }, { status: 404 });
	}

	if (new Date(invitation.expires_at) < new Date()) {
		return json({ error: 'Invitation has expired' }, { status: 410 });
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
		return json({ error: memberError.message }, { status: 500 });
	}

	// If invitation specifies brand scoping, create brand access entries
	if (invitation.brand_ids && invitation.brand_ids.length > 0) {
		// Get the member ID we just created
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

	return json({ success: true });
};
