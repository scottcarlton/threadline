import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization, user, allMemberships } = locals;

	if (!user) {
		throw redirect(303, '/login');
	}

	// If the user already has any org membership, they've onboarded — bounce
	// them out of the wizard. The previous brand-count guard let rep-org users
	// re-enter onboarding (rep orgs have 0 brands by default) and re-submit
	// the create-org POST, producing duplicate orgs.
	if (allMemberships && allMemberships.length > 0) {
		throw redirect(303, '/insight');
	}

	return {
		organization: organization ?? null,
		user
	};
};
