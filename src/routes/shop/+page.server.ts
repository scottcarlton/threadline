import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	if (!organization) return { brands: [], products: [] };

	const buyerBrandIds = locals.isBuyer ? (locals.buyerBrandIds ?? []) : [];
	const hasBrandScope = buyerBrandIds.length > 0;

	// Use same client as dashboard (user-scoped, RLS applies)
	let brandsQuery = supabase
		.from('brands')
		.select('id, name, logo_url')
		.eq('is_active', true)
		.order('name');

	let productsQuery = supabase
		.from('products')
		.select('*, brands(id, name), product_variants(id, color, size), product_images(id, file_path, is_primary, sort_order)')
		.eq('is_active', true)
		.is('archived_at', null)
		.order('style_number');

	if (hasBrandScope) {
		brandsQuery = brandsQuery.in('id', buyerBrandIds);
		productsQuery = productsQuery.in('brand_id', buyerBrandIds);
	} else {
		brandsQuery = brandsQuery.eq('organization_id', organization.id);
		productsQuery = productsQuery.eq('organization_id', organization.id);
	}

	const [brandsRes, productsRes] = await Promise.all([brandsQuery, productsQuery]);

	return {
		brands: brandsRes.data ?? [],
		products: productsRes.data ?? []
	};
};
