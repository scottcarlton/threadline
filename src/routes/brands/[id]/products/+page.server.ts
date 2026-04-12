import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, '/shop');
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const brandId = params.id;

	const [brandRes, productsRes, seasonsRes] = await Promise.all([
		supabase.from('brands').select('id, name').eq('id', brandId).single(),
		supabase
			.from('products')
			.select('*, product_variants(id, color, size), product_images(id, file_path, is_primary, sort_order)')
			.eq('brand_id', brandId)
			.eq('organization_id', organization.id)
			.order('style_number'),
		supabase
			.from('seasons')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('name')
	]);

	if (brandRes.error || !brandRes.data) throw error(404, 'Brand not found');

	return {
		brand: brandRes.data,
		products: productsRes.data ?? [],
		seasons: seasonsRes.data ?? []
	};
};
