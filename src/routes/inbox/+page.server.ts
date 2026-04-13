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

	// Load account email map for auto-linking
	const orgId = locals.organization?.id;
	let accountEmailMap: { email: string; accountId: string; accountName: string }[] = [];
	if (orgId) {
		const { data: accounts } = await supabase
			.from('accounts')
			.select('id, business_name, contact_email')
			.eq('organization_id', orgId)
			.not('contact_email', 'is', null);
		accountEmailMap = (accounts ?? []).map((a) => ({
			email: a.contact_email!.toLowerCase(),
			accountId: a.id,
			accountName: a.business_name
		}));
	}

	return {
		connected: !!connection,
		emailAddress: connection?.email_address ?? null,
		accountEmailMap
	};
};
