import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, orgType } = locals;

	if (!organization) throw redirect(303, '/insight');

	// Brand orgs: render their self-brand's catalog directly at /products.
	if (orgType === 'brand') {
		const { data: selfBrand } = await supabase
			.from('brands')
			.select('id, name')
			.eq('is_self_brand', true)
			.single();

		if (!selfBrand) throw error(404, 'Self-brand not found for this organization.');

		const [productsRes, seasonsRes] = await Promise.all([
			supabase
				.from('products')
				.select(
					'*, product_variants(id, color, size), product_images(id, file_path, is_primary, sort_order)'
				)
				.eq('brand_id', selfBrand.id)
				.order('style_number'),
			supabase
				.from('seasons')
				.select('id, name')
				.eq('organization_id', organization.id)
				.eq('is_active', true)
				.order('name')
		]);

		return {
			brand: selfBrand,
			products: productsRes.data ?? [],
			seasons: seasonsRes.data ?? []
		};
	}

	// Rep orgs shouldn't hit /products directly — Products lives under each brand.
	throw redirect(303, '/brands');
};
