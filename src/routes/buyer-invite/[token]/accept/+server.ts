import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		throw redirect(303, `/buyer-invite/${params.token}`);
	}

	const userId = session.user.id;
	const token = params.token;

	// Look up the buyer invitation
	const { data: invitation } = await supabaseAdmin
		.from('buyer_invitations')
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

	// Create account_users row
	const { error: memberError } = await supabaseAdmin.from('account_users').insert({
		account_id: invitation.account_id,
		profile_id: userId,
		role: 'buyer',
		invited_by: invitation.invited_by,
		accepted_at: new Date().toISOString()
	});

	if (memberError) {
		throw redirect(303, '/login?error=invite_accept_failed');
	}

	// Mark invitation as accepted
	await supabaseAdmin
		.from('buyer_invitations')
		.update({ accepted_at: new Date().toISOString() })
		.eq('id', invitation.id);

	throw redirect(303, '/dashboard');
};
