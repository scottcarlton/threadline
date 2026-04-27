import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('data:products');
	const { supabase, organization, orgType, allMemberships } = locals;

	if (!organization) throw redirect(303, '/insight');

	// Nx-BLSR: sales-role member of 2+ brand-orgs. Union the self-brands across
	// every brand-org they belong to and render a single multi-brand catalog.
	const brandOrgIds = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);

	const search = url.searchParams.get('search')?.trim() ?? '';
	const seasonFilter = url.searchParams.get('season') ?? '';
	const categoryFilter = url.searchParams.get('category') ?? '';

	if (nxBlsr) {
		// Pull every active brand across the user's brand-org memberships.
		// Don't gate on is_self_brand — Nx-BLSR users may sell sub-brands or
		// secondary lines within their orgs, and we want all of them visible.
		const { data: selfBrands } = await supabase
			.from('brands')
			.select('id, name')
			.in('organization_id', brandOrgIds)
			.eq('is_active', true)
			.order('name');

		const brandIds = (selfBrands ?? []).map((b) => b.id);
		if (brandIds.length === 0)
			throw error(404, 'No active brands found across your organizations.');

		let productsQuery = supabase
			.from('products')
			.select(
				'*, product_variants(id, color, size, stock_qty, stock_threshold, shopify_variant_id), product_images(id, file_path, is_primary, sort_order), brands(id, name)',
				{ count: 'exact' }
			)
			.in('brand_id', brandIds)
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
				.select('id, name, organization_id')
				.in('organization_id', brandOrgIds)
				.eq('is_active', true)
				.order('name')
		]);

		const totalCount = productsRes.count ?? (productsRes.data ?? []).length;

		return {
			brand: null,
			brands: selfBrands ?? [],
			products: productsRes.data ?? [],
			hasMore: totalCount > PAGE_SIZE,
			totalCount,
			seasons: seasonsRes.data ?? []
		};
	}

	// Single brand org: render its self-brand's catalog directly at /products.
	if (orgType === 'brand') {
		const { data: selfBrand } = await supabase
			.from('brands')
			.select('id, name')
			.eq('is_self_brand', true)
			.single();

		if (!selfBrand) throw error(404, 'Self-brand not found for this organization.');

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
			brands: [selfBrand],
			products: productsRes.data ?? [],
			hasMore: totalCount > PAGE_SIZE,
			totalCount,
			seasons: seasonsRes.data ?? []
		};
	}

	// Rep orgs (MBISR/MBLSR): show a federated multi-brand catalog spanning
	// every brand the user has RLS visibility into via active connections.
	// `/brands` lets them drill to one brand; `/products` is the cross-brand
	// view. RLS is the authoritative gate — query brands without an org_id
	// filter and let the policy resolve federation.
	if (orgType === 'rep') {
		const { data: brands } = await supabase
			.from('brands')
			.select('id, name')
			.eq('is_active', true)
			.order('name');
		const brandIds = (brands ?? []).map((b) => b.id);
		if (brandIds.length === 0) throw error(404, 'No active brands found across your connections.');

		let productsQuery = supabase
			.from('products')
			.select(
				'*, product_variants(id, color, size, stock_qty, stock_threshold, shopify_variant_id), product_images(id, file_path, is_primary, sort_order), brands(id, name)',
				{ count: 'exact' }
			)
			.in('brand_id', brandIds)
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

		// Connected brand-orgs' season ids. RLS on seasons follows the same
		// federation policy, so query without an org filter.
		const [productsRes, seasonsRes] = await Promise.all([
			productsQuery,
			supabase.from('seasons').select('id, name').eq('is_active', true).order('name')
		]);

		const totalCount = productsRes.count ?? (productsRes.data ?? []).length;

		return {
			brand: null,
			brands: brands ?? [],
			products: productsRes.data ?? [],
			hasMore: totalCount > PAGE_SIZE,
			totalCount,
			seasons: seasonsRes.data ?? []
		};
	}

	// Fallback (shouldn't normally hit): preserve the legacy redirect.
	throw redirect(303, '/brands');
};
