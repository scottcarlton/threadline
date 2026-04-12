import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, `/shop/${params.productId}`);
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const [brandRes, productRes, seasonsRes] = await Promise.all([
		supabase.from('brands').select('id, name').eq('id', params.id).single(),
		supabase
			.from('products')
			.select('*, product_variants(*), product_images(*)')
			.eq('id', params.productId)
			.eq('brand_id', params.id)
			.single(),
		supabase
			.from('seasons')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('name')
	]);

	if (brandRes.error || !brandRes.data) throw error(404, 'Brand not found');
	if (productRes.error || !productRes.data) throw error(404, 'Product not found');

	return {
		brand: brandRes.data,
		product: productRes.data,
		seasons: seasonsRes.data ?? []
	};
};
