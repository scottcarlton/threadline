import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return { accounts: [], brands: [], seasons: [], shows: [] };

	const [accountsRes, brandsRes, seasonsRes, showsRes] = await Promise.all([
		supabase.from('accounts').select('id, business_name').eq('organization_id', organization.id).eq('is_active', true).order('business_name'),
		supabase.from('brands').select('id, name').eq('organization_id', organization.id).eq('is_active', true).order('name'),
		supabase.from('seasons').select('id, name').eq('organization_id', organization.id).eq('is_active', true).order('sort_order'),
		supabase.from('shows').select('id, name, season_id, year').eq('organization_id', organization.id).eq('is_active', true).order('start_date', { ascending: false })
	]);

	return {
		accounts: accountsRes.data ?? [],
		brands: brandsRes.data ?? [],
		seasons: seasonsRes.data ?? [],
		shows: showsRes.data ?? []
	};
};
