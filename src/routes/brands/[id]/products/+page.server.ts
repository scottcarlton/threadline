import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { getConnectedBrandOrgIds } from '$lib/server/federation.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, '/shop');
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const brandId = params.id;

	// Check if this is an own-org brand or a federated brand
	let brand = (await supabase.from('brands').select('id, name').eq('id', brandId).single()).data;
	let isFederated = false;

	if (!brand && locals.orgType === 'rep') {
		const connectedOrgIds = await getConnectedBrandOrgIds(supabaseAdmin, organization.id);
		if (connectedOrgIds.length > 0) {
			const { data: fedBrand } = await supabaseAdmin
				.from('brands')
				.select('id, name')
				.eq('id', brandId)
				.in('organization_id', connectedOrgIds)
				.single();
			brand = fedBrand;
			isFederated = true;
		}
	}

	if (!brand) throw error(404, 'Brand not found');

	const db = isFederated ? supabaseAdmin : supabase;

	// For own-org brands, filter by organization_id. For federated, query by brand_id only.
	const productsQuery = db
		.from('products')
		.select(
			'*, product_variants(id, color, size), product_images(id, file_path, is_primary, sort_order)'
		)
		.eq('brand_id', brandId);

	if (!isFederated) {
		productsQuery.eq('organization_id', organization.id);
	}

	const [productsRes, seasonsRes] = await Promise.all([
		productsQuery.order('style_number'),
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
