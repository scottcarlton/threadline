import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

// Top-level product detail. Brand is derived from the product itself so the
// URL stays /products/<id> regardless of which brand-org owns it. Used by
// brand-org users (single-brand) and Nx-BLSR (multi-brand-org sales) — both
// link from the /products list to here.
export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, `/shop/${params.productId}`);
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	// RLS handles federation visibility — query by id only.
	const { data: product, error: productErr } = await supabase
		.from('products')
		.select(
			'*, product_variants(*), product_images(*), seasons(name), profiles:updated_by(display_name)'
		)
		.eq('id', params.productId)
		.single();
	if (productErr || !product) throw error(404, 'Product not found');

	// Resolve the brand off the product so the page header still renders.
	const { data: brand } = await supabase
		.from('brands')
		.select('id, name')
		.eq('id', product.brand_id)
		.single();
	if (!brand) throw error(404, 'Brand not found for this product');

	const seasonsRes = await supabase
		.from('seasons')
		.select('id, name')
		.eq('organization_id', product.organization_id)
		.eq('is_active', true)
		.order('name');

	return {
		brand,
		product,
		seasons: seasonsRes.data ?? []
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		const { organization, membership, user } = locals;
		if (!organization || !['admin', 'owner', 'member'].includes(membership?.role ?? '')) {
			return fail(403, { error: 'Not allowed' });
		}

		const fd = await request.formData();
		const nn = (v: string | null) => (v && v.length ? v : null);

		const { error: updateErr } = await supabaseAdmin
			.from('products')
			.update({
				style_number: fd.get('style_number') as string,
				name: fd.get('name') as string,
				description: nn(fd.get('description') as string),
				wholesale_price: parseFloat((fd.get('wholesale_price') as string) || '0'),
				retail_price: parseFloat((fd.get('retail_price') as string) || '0') || null,
				category: nn(fd.get('category') as string),
				subcategory: nn(fd.get('subcategory') as string),
				season_id: nn(fd.get('season_id') as string),
				product_year: parseInt((fd.get('product_year') as string) || '0', 10) || null,
				ats: fd.get('ats') === 'true',
				is_featured: fd.get('is_featured') === 'true',
				updated_at: new Date().toISOString(),
				updated_by: user?.id ?? null
			})
			.eq('id', params.productId);

		if (updateErr) {
			return fail(500, { error: updateErr.message });
		}

		return { success: true };
	},

	delete: async ({ locals, params }) => {
		const { organization, membership } = locals;
		if (!organization || !['admin', 'owner'].includes(membership?.role ?? '')) {
			return fail(403, { error: 'Not allowed' });
		}

		const { error: deleteErr } = await supabaseAdmin
			.from('products')
			.delete()
			.eq('id', params.productId);

		if (deleteErr) {
			return fail(500, { error: deleteErr.message });
		}

		throw redirect(303, '/products');
	}
};
