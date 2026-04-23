import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('data:products');
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

		const search = url.searchParams.get('search')?.trim() ?? '';
		const seasonFilter = url.searchParams.get('season') ?? '';
		const categoryFilter = url.searchParams.get('category') ?? '';

		let productsQuery = supabase
			.from('products')
			.select(
				'*, product_variants(id, color, size, stock_qty, stock_threshold, shopify_variant_id), product_images(id, file_path, is_primary, sort_order)',
				{ count: 'exact' }
			)
			.eq('brand_id', selfBrand.id)
			.is('archived_at', null)
			.order('style_number')
			.range(0, PAGE_SIZE - 1);

		if (search) {
			productsQuery = productsQuery.or(
				`style_number.ilike.%${search}%,name.ilike.%${search}%,category.ilike.%${search}%`
			);
		}
		if (seasonFilter) productsQuery = productsQuery.eq('season_id', seasonFilter);
		if (categoryFilter) productsQuery = productsQuery.eq('category', categoryFilter);

		const [productsRes, seasonsRes] = await Promise.all([
			productsQuery,
			supabase
				.from('seasons')
				.select('id, name')
				.eq('organization_id', organization.id)
				.eq('is_active', true)
				.order('name')
		]);

		const totalCount = productsRes.count ?? (productsRes.data ?? []).length;

		return {
			brand: selfBrand,
			products: productsRes.data ?? [],
			hasMore: totalCount > PAGE_SIZE,
			totalCount,
			seasons: seasonsRes.data ?? []
		};
	}

	// Rep orgs shouldn't hit /products directly — Products lives under each brand.
	throw redirect(303, '/brands');
};
