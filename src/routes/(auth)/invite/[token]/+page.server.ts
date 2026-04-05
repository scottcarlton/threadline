import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ params }) => {
	const { data: invitation, error: invError } = await supabaseAdmin
		.from('invitations')
		.select('*, organizations(name, logo_url)')
		.eq('token', params.token)
		.is('accepted_at', null)
		.single();

	if (invError || !invitation) {
		throw error(404, 'Invitation not found or already used');
	}

	if (new Date(invitation.expires_at) < new Date()) {
		throw error(410, 'This invitation has expired');
	}

	return {
		invitation: {
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			token: invitation.token,
			orgName: invitation.organizations?.name ?? 'Unknown',
			orgLogo: invitation.organizations?.logo_url
		}
	};
};
