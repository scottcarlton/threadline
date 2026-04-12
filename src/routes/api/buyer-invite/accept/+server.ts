import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request }) => {
	const { token, userId } = await request.json();

	if (!token || !userId) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	// Look up the buyer invitation
	const { data: invitation, error: invError } = await supabaseAdmin
		.from('buyer_invitations')
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

	// Create account_users row
	const { error: memberError } = await supabaseAdmin.from('account_users').insert({
		account_id: invitation.account_id,
		profile_id: userId,
		role: 'buyer',
		invited_by: invitation.invited_by,
		accepted_at: new Date().toISOString()
	});

	if (memberError) {
		return json({ error: memberError.message }, { status: 500 });
	}

	// Mark invitation as accepted
	await supabaseAdmin
		.from('buyer_invitations')
		.update({ accepted_at: new Date().toISOString() })
		.eq('id', invitation.id);

	return json({ success: true });
};
