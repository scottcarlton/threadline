import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization, user, supabase } = locals;

	if (!user) {
		throw redirect(303, '/login');
	}

	// Bounce to /insight only when the user's primary org has finished
	// onboarding. Mid-onboarding users (membership exists but
	// onboarding_completed_at is NULL) are allowed back in to resume from
	// their last step. Rep-only edge cases that previously caused dup orgs
	// (re-entering onboarding because they had 0 brands) are still
	// prevented because rep orgs go through the same finish flow that sets
	// onboarding_completed_at.
	if (organization?.onboarding_completed_at) {
		throw redirect(303, '/insight');
	}

	// Org seasons feed the catalog step's <ProductImportFlow> so it can
	// match AI-detected season hints to a real season_id and offer the
	// fallback dropdown when detection fails. Brand-orgs get the seeded
	// set (Spring/Summer/Fall/Resort/Holiday) at creation, so this query
	// returns ≥5 rows for any brand-org partway through onboarding.
	const seasons = organization
		? ((
				await supabase
					.from('seasons')
					.select('id, name')
					.eq('organization_id', organization.id)
					.eq('is_active', true)
					.order('sort_order', { ascending: true })
			).data ?? [])
		: [];

	return {
		organization: organization ?? null,
		seasons: seasons as { id: string; name: string }[],
		user
	};
};
