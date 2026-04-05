import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return { shows: [], seasons: [] };

	const [showsResult, seasonsResult] = await Promise.all([
		supabase
			.from('shows')
			.select('*, seasons(name)')
			.eq('organization_id', organization.id)
			.order('start_date', { ascending: false }),
		supabase
			.from('seasons')
			.select('*')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('sort_order')
	]);

	return {
		shows: showsResult.data ?? [],
		seasons: seasonsResult.data ?? []
	};
};
