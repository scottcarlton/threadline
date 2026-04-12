import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return { shows: [] };

	const { data: shows } = await supabase
		.from('shows')
		.select('*, show_dates(*)')
		.eq('organization_id', organization.id)
		.order('name');

	return {
		shows: shows ?? []
	};
};
