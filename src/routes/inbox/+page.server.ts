import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, user, brandScope } = locals;

	// Brand-scoped members/guests cannot access inbox
	if (brandScope && brandScope.length > 0) {
		throw redirect(303, '/insight');
	}

	if (!user) {
		return { connected: false, emailAddress: null };
	}

	const { data: connection } = await supabase
		.from('email_connections')
		.select('email_address')
		.eq('profile_id', user.id)
		.maybeSingle();

	return {
		connected: !!connection,
		emailAddress: connection?.email_address ?? null
	};
};
