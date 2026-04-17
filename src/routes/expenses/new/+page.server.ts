import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	if (!organization) return { brands: [] };

	// RLS handles federation visibility — no admin client needed
	const { data: brands } = await supabase
		.from('brands')
		.select('id, name')
		.eq('is_active', true)
		.order('name');

	return { brands: brands ?? [] };
};
