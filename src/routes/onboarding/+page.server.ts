import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, user } = locals;

	if (!user) {
		throw redirect(303, '/login');
	}

	// If user has an org with brands, they've already onboarded
	// For brand orgs, the self-brand is auto-created, so check for non-self brands or just the org_type being set
	if (organization) {
		const { count } = await supabase
			.from('brands')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', organization.id);

		// Brand orgs have a self-brand auto-created, so count >= 1 means onboarded
		// Rep orgs need at least 1 brand added manually
		if (count && count > 0) {
			throw redirect(303, '/insight');
		}
	}

	return {
		organization: organization ?? null,
		user
	};
};
