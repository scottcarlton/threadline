import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { resolveAcceptingProfileId } from '$lib/server/invites/authorize.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { session, user: sessionUser } = await locals.safeGetSession();
	if (!session) {
		throw redirect(303, `/buyer-invite/${params.token}`);
	}

	const userId = session.user.id;
	const token = params.token;

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

	// Buyer-admin invites create one buyer_invitations row per account the
	// admin has access to (all sharing the same email). When the invitee
	// clicks any one of those links, accept every pending invitation that
	// matches their email so they land with access to the full set in one
	// step. The primary invitation (the token in the URL) and every sibling
	// are all gated on the same check: the session's authenticated email
	// must match the invitation's recipient email, so a leaked token alone
	// is never enough to join an account.
	const authResult = resolveAcceptingProfileId(sessionUser, undefined, invitation.email);
	if (!authResult.ok) {
		throw redirect(
			303,
			`/login?error=invite_email_mismatch&expected=${encodeURIComponent(invitation.email)}`
		);
	}

	type Invitation = {
		id: string;
		account_id: string;
		invited_by: string;
		role: string | null;
		email: string;
		expires_at: string;
	};

	const targets: Invitation[] = [invitation as Invitation];

	const { data: siblings } = await supabaseAdmin
		.from('buyer_invitations')
		.select('id, account_id, invited_by, role, email, expires_at')
		.ilike('email', invitation.email)
		.is('accepted_at', null)
		.neq('id', invitation.id);

	for (const s of (siblings ?? []) as Invitation[]) {
		if (new Date(s.expires_at) < new Date()) continue;
		targets.push(s);
	}

	const acceptedAt = new Date().toISOString();
	for (const inv of targets) {
		const { error: memberError } = await supabaseAdmin.from('account_users').upsert(
			{
				account_id: inv.account_id,
				profile_id: userId,
				role: inv.role ?? 'buyer',
				invited_by: inv.invited_by,
				accepted_at: acceptedAt
			},
			{ onConflict: 'account_id,profile_id' }
		);

		if (memberError) {
			throw redirect(303, '/login?error=invite_accept_failed');
		}

		await supabaseAdmin
			.from('buyer_invitations')
			.update({ accepted_at: acceptedAt })
			.eq('id', inv.id);
	}

	throw redirect(303, '/dashboard');
};
