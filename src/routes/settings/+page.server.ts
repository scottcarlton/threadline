import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, user } = locals;

	if (!user) {
		return { emailConnected: false, emailAddress: null };
	}

	const { data: connection } = await supabase
		.from('email_connections')
		.select('email_address')
		.eq('profile_id', user.id)
		.maybeSingle();

	return {
		emailConnected: !!connection,
		emailAddress: connection?.email_address ?? null
	};
};
