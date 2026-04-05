import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return { seasons: [] };

	const { data: seasons } = await supabase
		.from('seasons')
		.select('*')
		.eq('organization_id', organization.id)
		.eq('is_active', true)
		.order('sort_order');

	return { seasons: seasons ?? [] };
};
