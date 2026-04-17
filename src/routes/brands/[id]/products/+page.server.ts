import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, '/shop');
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const brandId = params.id;

	// RLS handles federation visibility — just query by ID
	const { data: brand } = await supabase
		.from('brands')
		.select('id, name, organization_id')
		.eq('id', brandId)
		.single();

	if (!brand) throw error(404, 'Brand not found');

	const isFederated = brand.organization_id !== organization.id;

	const [productsRes, seasonsRes] = await Promise.all([
		supabase
			.from('products')
			.select(
				'*, product_variants(id, color, size), product_images(id, file_path, is_primary, sort_order)'
			)
			.eq('brand_id', brandId)
			.order('style_number'),
		supabase
			.from('seasons')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('name')
	]);

	return {
		brand,
		products: productsRes.data ?? [],
		seasons: seasonsRes.data ?? [],
		isFederated
	};
};
