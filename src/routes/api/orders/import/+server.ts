import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { orderImportSchema, type OrderImportResult } from '$lib/schemas/order-import.js';
import { groupOrderRows } from '$lib/components/orders/group-order-rows.js';

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

	const groups = groupOrderRows(rows);
	const result: OrderImportResult = { created: 0, skipped: [], errors: [] };

	for (const group of groups) {
		const accountId = accountByName.get(group.account.toLowerCase());
		if (!accountId) {
			for (const line of group.lines) {
				const rowNum = rows.indexOf(line) + 1;
				result.skipped.push({ row: rowNum, reason: `Account "${group.account}" not found` });
			}
			continue;
		}

		const validLines: {
			row: number;
			product_id: string;
			style_number: string;
			qty: number;
			unit_price: number;
			color: string | null;
			size: string | null;
		}[] = [];

		for (const line of group.lines) {
			const rowNum = rows.indexOf(line) + 1;
			const product = productByStyle.get(line.style_number.toLowerCase());
			if (!product) {
				result.skipped.push({
					row: rowNum,
					reason: `Style "${line.style_number}" not in your catalog`
				});
				continue;
			}
			validLines.push({
				row: rowNum,
				product_id: product.id,
				style_number: line.style_number,
				qty: line.qty,
				unit_price: line.unit_price ?? product.wholesale_price,
				color: line.color,
				size: line.size
			});
		}

		if (validLines.length === 0) continue;

		const firstRow = group.lines[0];
		const { data: orderRow, error: orderErr } = await supabaseAdmin
			.from('orders')
			.insert({
				organization_id: orgId,
				brand_id: brandId,
				account_id: accountId,
				created_by: userId,
				status: 'draft',
				order_type: 'direct',
				expected_ship_date: firstRow.expected_ship_date,
				notes: firstRow.notes
			})
			.select('id')
			.single();

		if (orderErr || !orderRow) {
			for (const vl of validLines) {
				result.errors.push({
					row: vl.row,
					reason: orderErr?.message ?? 'Failed to create order'
				});
			}
			continue;
		}

		const { error: linesErr } = await supabaseAdmin.from('order_lines').insert(
			validLines.map((vl, idx) => ({
				order_id: orderRow.id,
				product_id: vl.product_id,
				style_number: vl.style_number,
				qty: vl.qty,
				unit_price: vl.unit_price,
				color: vl.color,
				size: vl.size,
				sort_order: idx
			}))
		);

		if (linesErr) {
			for (const vl of validLines) {
				result.errors.push({
					row: vl.row,
					reason: `Order created but lines failed — ${linesErr.message}`
				});
			}
			continue;
		}

		result.created++;
	}

	return json(result);
};
