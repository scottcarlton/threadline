import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { supabase, organization } = locals;
	if (!organization) return { orders: [], seasons: [], brands: [] };

	const status = url.searchParams.get('status');
	const seasonId = url.searchParams.get('season');
	const year = url.searchParams.get('year');
	const brandId = url.searchParams.get('brand');

	let query = supabase
		.from('orders')
		.select('*, brands(name), accounts(business_name), seasons(name)')
		.eq('organization_id', organization.id)
		.order('created_at', { ascending: false });

	if (status) query = query.eq('status', status);
	if (seasonId) query = query.eq('season_id', seasonId);
	if (year) query = query.eq('order_year', parseInt(year));
	if (brandId) query = query.eq('brand_id', brandId);

	const [ordersResult, seasonsResult, brandsResult] = await Promise.all([
		query,
		supabase.from('seasons').select('*').eq('organization_id', organization.id).eq('is_active', true).order('sort_order'),
		supabase.from('brands').select('id, name').eq('organization_id', organization.id).eq('is_active', true).order('name')
	]);

	return {
		orders: ordersResult.data ?? [],
		seasons: seasonsResult.data ?? [],
		brands: brandsResult.data ?? []
	};
};
