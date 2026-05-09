import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('data:seasons');
	const { supabase, organization } = locals;
	if (!organization) return { seasons: [], deliveries: [] };

	const [seasonsRes, deliveriesRes] = await Promise.all([
		supabase.from('seasons').select('*').eq('organization_id', organization.id).order('sort_order'),
		supabase
			.from('season_deliveries')
			.select('*')
			.eq('organization_id', organization.id)
			.order('sort_order')
	]);

	return {
		seasons: seasonsRes.data ?? [],
		deliveries: deliveriesRes.data ?? []
	};
};
