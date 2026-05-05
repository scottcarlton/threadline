import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { PageServerLoad, Actions } from './$types';
import { createProductSchema } from '$lib/schemas/product';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, membership, orgType } = locals;
	if (!organization) throw error(404, 'Organization not found');
	if (!['admin', 'owner', 'member'].includes(membership?.role ?? '')) {
		throw error(403, 'Not allowed');
	}
	if (orgType !== 'brand') throw error(404, 'Add Product lives under each brand for rep orgs');

	const { data: brand } = await supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', organization.id)
		.eq('is_self_brand', true)
		.single();
	if (!brand) throw error(404, 'Self-brand not found for this organization');

	const seasonsRes = await supabase
		.from('seasons')
		.select('id, name')
		.eq('organization_id', organization.id)
		.eq('is_active', true)
		.order('name');

	const form = await superValidate(zod4(createProductSchema));

	return {
		form,
		brand,
		seasons: seasonsRes.data ?? []
	};
};

function colorSlug(name: string): string {
	return name
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 6);
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(createProductSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { organization, supabase } = locals;
		if (!organization) {
			return fail(403, { form });
		}

		const { data: brand } = await supabase
			.from('brands')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('is_self_brand', true)
			.single();
		if (!brand) {
			return fail(404, { form });
		}

		const d = form.data;
		const nn = (v: string | undefined) => (v && v.length ? v : null);

		const { data: product, error: prodErr } = await supabase
			.from('products')
			.insert({
				organization_id: organization.id,
				brand_id: brand.id,
				name: d.name,
				style_number: d.styleNumber,
				description: nn(d.description),
				wholesale_price: d.wholesalePrice,
				retail_price: d.retailPrice ?? null,
				category: nn(d.category),
				season_id: nn(d.seasonId),
				product_year: d.productYear ?? null,
				ats: d.ats,
				is_featured: d.featured
			})
			.select('id')
			.single();

		if (prodErr || !product) {
			return fail(500, { form, message: prodErr?.message ?? 'Failed to create product.' });
		}

		const variantRows: Array<{
			product_id: string;
			color: string | null;
			color_hex: string | null;
			size: string;
			sku: string;
			stock_qty: number | null;
			stock_threshold: number | null;
		}> = [];

		if (d.hasVariants) {
			for (const v of d.variants) {
				const slug = colorSlug(v.colorName);
				for (const size of d.sizes) {
					variantRows.push({
						product_id: product.id,
						color: v.colorName,
						color_hex: nn(v.colorHex),
						size,
						sku: `${d.styleNumber}-${slug}-${size}`.toUpperCase(),
						stock_qty: d.ats ? (v.inventory[size] ?? null) : null,
						stock_threshold: d.ats ? (v.stockThreshold ?? null) : null
					});
				}
			}
		} else {
			for (const size of d.sizes) {
				variantRows.push({
					product_id: product.id,
					color: null,
					color_hex: null,
					size,
					sku: `${d.styleNumber}-${size}`.toUpperCase(),
					stock_qty: d.ats ? (d.productInventory[size] ?? null) : null,
					stock_threshold: d.ats ? (d.stockThreshold ?? null) : null
				});
			}
		}

		const colorToVariantId: Record<string, string> = {};

		if (variantRows.length > 0) {
			const { data: inserted, error: varErr } = await supabase
				.from('product_variants')
				.insert(variantRows)
				.select('id, color');
			if (varErr) {
				return fail(500, {
					form,
					message: `Product created but variants failed: ${varErr.message}`
				});
			}
			if (inserted) {
				for (const row of inserted) {
					const key = row.color ?? '__none__';
					if (!colorToVariantId[key]) {
						colorToVariantId[key] = row.id;
					}
				}
			}
		}

		return message(form, {
			kind: 'success' as const,
			productId: product.id,
			colorToVariantId
		});
	}
};
