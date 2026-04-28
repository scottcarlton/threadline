import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { orderImportSchema, type OrderImportResult } from '$lib/schemas/order-import.js';

// Bulk order import endpoint. One CSV row = one order with one line
// item (matches the legacy BulkImportModal contract — preserve for now,
// improve in a follow-up if we want grouping by account).
//
// Per-row resolution:
//   1. Look up account by business_name (case-insensitive) within the
//      caller's org. Missing → skip row.
//   2. Look up product by style_number within the org's self-brand.
//      Missing → skip row.
//   3. Insert orders row, then order_lines row. Either failure → push
//      to errors and continue.
//
// Bulk-resolve accounts + products in two queries up front so we don't
// fan out N round trips per row.

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

	const parsed = orderImportSchema.safeParse(body);
	if (!parsed.success) {
		const first = parsed.error.issues[0];
		return json({ error: first?.message ?? 'Invalid payload' }, { status: 400 });
	}

	const { rows } = parsed.data;
	const orgId = locals.organization.id;
	const userId = locals.user.id;

	// Resolve the org's self-brand once. Orders need a brand_id; the
	// importer is single-brand only (matching the legacy flow).
	const { data: selfBrand, error: brandErr } = await supabaseAdmin
		.from('brands')
		.select('id')
		.eq('organization_id', orgId)
		.eq('is_self_brand', true)
		.maybeSingle();
	if (brandErr) return json({ error: brandErr.message }, { status: 500 });
	if (!selfBrand) {
		return json({ error: 'No self-brand found for this organization' }, { status: 404 });
	}
	const brandId = selfBrand.id;

	// Bulk-resolve accounts + products. Build lower-case keyed maps so
	// per-row lookups are O(1). Pulls the full set for the org/brand —
	// fine for current scale; if that ever blows up, swap in narrower
	// IN-list filters keyed by the unique names actually referenced.
	const { data: accountRows, error: accountsErr } = await supabaseAdmin
		.from('accounts')
		.select('id, business_name')
		.eq('organization_id', orgId);
	if (accountsErr) return json({ error: accountsErr.message }, { status: 500 });
	const accountByName = new Map<string, string>();
	for (const a of accountRows ?? []) {
		accountByName.set(a.business_name.toLowerCase(), a.id);
	}

	const { data: productRows, error: productsErr } = await supabaseAdmin
		.from('products')
		.select('id, style_number, wholesale_price')
		.eq('brand_id', brandId);
	if (productsErr) return json({ error: productsErr.message }, { status: 500 });
	const productByStyle = new Map<string, { id: string; wholesale_price: number }>();
	for (const p of productRows ?? []) {
		productByStyle.set(p.style_number.toLowerCase(), {
			id: p.id,
			wholesale_price: Number(p.wholesale_price)
		});
	}

	const result: OrderImportResult = { created: 0, skipped: [], errors: [] };

	// Per-row insert. Two writes (orders + order_lines) — keep them
	// sequential so the order_id is available for the line.
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 1;

		const accountId = accountByName.get(row.account.toLowerCase());
		const product = productByStyle.get(row.style_number.toLowerCase());

		if (!accountId && !product) {
			result.skipped.push({
				row: rowNum,
				reason: `Account "${row.account}" not found and style "${row.style_number}" not in your catalog`
			});
			continue;
		}
		if (!accountId) {
			result.skipped.push({
				row: rowNum,
				reason: `Account "${row.account}" not found`
			});
			continue;
		}
		if (!product) {
			result.skipped.push({
				row: rowNum,
				reason: `Style "${row.style_number}" not in your catalog`
			});
			continue;
		}

		const unitPrice = row.unit_price ?? product.wholesale_price;
		const totalAmount = row.qty * unitPrice;

		const { data: orderRow, error: orderErr } = await supabaseAdmin
			.from('orders')
			.insert({
				organization_id: orgId,
				brand_id: brandId,
				account_id: accountId,
				created_by: userId,
				status: 'draft',
				order_type: 'direct',
				expected_ship_date: row.expected_ship_date,
				notes: row.notes,
				total_amount: totalAmount
			})
			.select('id')
			.single();
		if (orderErr || !orderRow) {
			result.errors.push({
				row: rowNum,
				reason: orderErr?.message ?? 'Failed to create order'
			});
			continue;
		}

		const { error: lineErr } = await supabaseAdmin.from('order_lines').insert({
			order_id: orderRow.id,
			product_id: product.id,
			style_number: row.style_number,
			qty: row.qty,
			unit_price: unitPrice,
			color: row.color,
			size: row.size
		});
		if (lineErr) {
			result.errors.push({
				row: rowNum,
				reason: `Order created but line item failed — ${lineErr.message}`
			});
			continue;
		}

		result.created++;
	}

	return json(result);
};
