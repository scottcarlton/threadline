import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { fetchAndUploadProductImageFromUrl } from '$lib/server/products/upload-image.js';
import {
	productImportSchema,
	type ProductDraft,
	type ProductImportResult
} from '$lib/schemas/product-import.js';

// Bulk product import endpoint. Two callers:
//
//   1. The PDF/linesheet preview screen (after /api/products/parse-linesheet
//      extracts products via Claude). The user reviews + edits, then
//      commits via this endpoint.
//   2. The CSV mapping/preview flow. The user maps headers → fields, the
//      preview screen shows the result, the user commits via this endpoint.
//
// Both paths converge here so the dedupe / variant fan-out / image fetch
// logic only lives once.
//
// Permission gate: matches the products RLS write policy
// (admin/owner/member of the brand's owning org). Members CAN insert
// products today — see migration 20260405000024:55-58 — so the import
// endpoint stays consistent with single-product creation.
//
// Dedupe strategy: there's no UNIQUE (brand_id, style_number) constraint
// on `products` today, so we can't use ON CONFLICT. We do an app-level
// lookup of existing style_numbers for the brand, then INSERT fresh rows
// or UPDATE matched rows depending on the user's onConflict choice. If a
// schema migration ever adds the constraint, we can switch to a single
// UPSERT round trip.
//
// Variants: each product's sizes × colors arrays cross-product into
// `product_variants` rows. Empty sizes + non-empty colors → one row per
// color with size=null (and vice versa). Both empty → no variants.
//
// Images: best-effort. Per product with a non-null image_url we call
// fetchAndUploadProductImageFromUrl after the product row exists. A
// failure (bad URL, 404, wrong content-type, oversized payload, timeout)
// is collected into imageFailures and the product still imports. The
// caller's preview shows the per-row failure list in the success toast.

const ALLOWED_ROLES = new Set(['admin', 'owner', 'member']);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const role = locals.membership?.role;
	if (!role || !ALLOWED_ROLES.has(role)) {
		return json({ error: 'Insufficient permissions' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = productImportSchema.safeParse(body);
	if (!parsed.success) {
		const first = parsed.error.issues[0];
		return json({ error: first?.message ?? 'Invalid payload' }, { status: 400 });
	}

	const { brandId, onConflict, products } = parsed.data;

	// Confirm the brand belongs to the active org. Federated import isn't
	// supported in v1 — the CSV/PDF importer is for the org that OWNS the
	// brand row, not for connected reps adding products to a BO's brand.
	const { data: brand } = await supabaseAdmin
		.from('brands')
		.select('id, organization_id')
		.eq('id', brandId)
		.single();
	if (!brand || brand.organization_id !== locals.organization.id) {
		return json({ error: 'Brand not found' }, { status: 404 });
	}

	const brandOrgId = brand.organization_id;
	const userId = locals.user.id;

	// Pull existing style_numbers in one round trip so the loop below can
	// decide skip-vs-update without per-row queries.
	const inputStyleNumbers = Array.from(new Set(products.map((p) => p.style_number)));
	const { data: existingRows } = await supabaseAdmin
		.from('products')
		.select('id, style_number')
		.eq('brand_id', brandId)
		.in('style_number', inputStyleNumbers);
	const existingByStyle = new Map<string, string>(
		(existingRows ?? []).map((r) => [r.style_number as string, r.id as string])
	);

	const result: ProductImportResult = {
		inserted: 0,
		skipped: 0,
		updated: 0,
		imageFailures: []
	};

	for (const draft of products) {
		const existingId = existingByStyle.get(draft.style_number);

		// Skip-path: existing style + onConflict=skip → leave the existing
		// row alone and don't touch its image either.
		if (existingId && onConflict === 'skip') {
			result.skipped += 1;
			continue;
		}

		const productPayload = {
			organization_id: brandOrgId,
			brand_id: brandId,
			style_number: draft.style_number,
			name: draft.name,
			description: draft.description,
			wholesale_price: draft.wholesale_price,
			retail_price: draft.retail_price,
			category: draft.category,
			subcategory: draft.subcategory,
			season_id: draft.season_id,
			product_year: draft.product_year,
			updated_at: new Date().toISOString()
		};

		let productId: string;

		if (existingId) {
			// Replace path: update the row, wipe + re-create variants. We
			// don't touch existing images on replace — re-uploading would
			// duplicate them; user can manage images via the product page.
			const { error: updErr } = await supabaseAdmin
				.from('products')
				.update(productPayload)
				.eq('id', existingId);
			if (updErr) {
				console.error('[products/import] update failed', {
					style_number: draft.style_number,
					error: updErr
				});
				continue;
			}
			productId = existingId;

			const { error: delErr } = await supabaseAdmin
				.from('product_variants')
				.delete()
				.eq('product_id', productId);
			if (delErr) {
				console.error('[products/import] variant wipe failed', {
					productId,
					error: delErr
				});
			}

			result.updated += 1;
		} else {
			// Insert path.
			const { data: inserted, error: insErr } = await supabaseAdmin
				.from('products')
				.insert(productPayload)
				.select('id')
				.single();
			if (insErr || !inserted) {
				console.error('[products/import] insert failed', {
					style_number: draft.style_number,
					error: insErr
				});
				continue;
			}
			productId = inserted.id as string;
			result.inserted += 1;
		}

		// Variants: cross-product sizes × colors. Empty array on either
		// side → one row per non-empty value with the missing axis NULL.
		const variantRows = buildVariantRows(productId, draft);
		if (variantRows.length > 0) {
			const { error: varErr } = await supabaseAdmin.from('product_variants').insert(variantRows);
			if (varErr) {
				console.error('[products/import] variant insert failed', {
					productId,
					count: variantRows.length,
					error: varErr
				});
			}
		}

		// Image fetch — best-effort. Only run on insert OR replace; we
		// never re-fetch an image on skip. A failure here doesn't roll
		// back the product.
		if (draft.image_url) {
			const imgResult = await fetchAndUploadProductImageFromUrl(supabaseAdmin, {
				productId,
				orgId: brandOrgId,
				url: draft.image_url,
				uploadedBy: userId
			});
			if (!imgResult.ok) {
				result.imageFailures.push({
					style_number: draft.style_number,
					reason: imgResult.reason
				});
			}
		}
	}

	return json(result, { status: 200 });
};

function buildVariantRows(productId: string, draft: ProductDraft) {
	const sizes = draft.sizes.length > 0 ? draft.sizes : [null];
	const colors = draft.colors.length > 0 ? draft.colors : [null];

	// If both are empty (both arrays got the [null] placeholder above and
	// the original arrays were empty), don't create a phantom variant row.
	if (draft.sizes.length === 0 && draft.colors.length === 0) return [];

	const rows: { product_id: string; color: string | null; size: string | null }[] = [];
	for (const color of colors) {
		for (const size of sizes) {
			rows.push({ product_id: productId, color, size });
		}
	}
	return rows;
}
