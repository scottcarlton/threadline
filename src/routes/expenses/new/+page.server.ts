import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	if (!organization) return { brands: [] };

	const { data: brands } = await supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', organization.id)
		.eq('is_active', true)
		.order('name');

	return {
		brands: brands ?? []
	};
};
