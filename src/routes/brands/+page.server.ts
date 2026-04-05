import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return { brands: [] };

	const { data: brands } = await supabase
		.from('brands')
		.select('*')
		.eq('organization_id', organization.id)
		.order('name');

	return { brands: brands ?? [] };
};
