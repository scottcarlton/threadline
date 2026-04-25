import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	if (!organization) return { brands: [], products: [], seasons: [] };

	const buyerBrandIds = locals.isBuyer ? (locals.buyerBrandIds ?? []) : [];
	const hasBrandScope = buyerBrandIds.length > 0;

	// Use same client as dashboard (user-scoped, RLS applies)
	let brandsQuery = supabase
		.from('brands')
		.select('id, name, logo_url, organization_id')
		.eq('is_active', true)
		.order('name');

	let productsQuery = supabase
		.from('products')
		.select(
			'*, brands(id, name), product_variants(id, color, size, stock_qty, stock_threshold, shopify_variant_id), product_images(id, file_path, is_primary, sort_order)'
		)
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
	const brands = (brandsRes.data ?? []) as Array<{
		id: string;
		name: string;
		logo_url: string | null;
		organization_id: string;
	}>;

	// Seasons span every org the visible brands belong to. Buyer may have
	// access to brands from multiple connected orgs, so unique those out.
	const seasonOrgIds = Array.from(new Set(brands.map((b) => b.organization_id)));
	const seasonsRes =
		seasonOrgIds.length > 0
			? await supabase
					.from('seasons')
					.select('id, name')
					.in('organization_id', seasonOrgIds)
					.eq('is_active', true)
					.order('sort_order')
			: { data: [] };
	// Dedupe seasons by name across orgs (Spring from BOA + Spring from
	// connected reps collapse to one chip).
	const seenSeasonNames = new Set<string>();
	const seasons = ((seasonsRes.data ?? []) as Array<{ id: string; name: string }>).filter((s) => {
		const key = s.name.trim().toLowerCase();
		if (seenSeasonNames.has(key)) return false;
		seenSeasonNames.add(key);
		return true;
	});

	return {
		brands,
		products: productsRes.data ?? [],
		seasons
	};
};
