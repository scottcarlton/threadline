import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!locals.membership || !['admin', 'owner', 'member'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = (await request.json()) as { stock_qty: number | null };
	if (body.stock_qty !== null && (!Number.isInteger(body.stock_qty) || body.stock_qty < 0)) {
		return json({ error: 'stock_qty must be a non-negative integer or null' }, { status: 400 });
	}

	// Load variant + parent product to enforce org + shopify-guard.
	const { data: variant, error: loadErr } = await supabaseAdmin
		.from('product_variants')
		.select('id, shopify_variant_id, products!inner(organization_id)')
		.eq('id', params.variantId)
		.single();

	if (loadErr || !variant) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	const parentOrg = variant.products as
		| { organization_id: string }
		| { organization_id: string }[]
		| null;
	const orgId = Array.isArray(parentOrg)
		? parentOrg[0]?.organization_id
		: parentOrg?.organization_id;
	if (orgId !== locals.organization.id) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	if (variant.shopify_variant_id) {
		return json({ error: 'Variant is managed by Shopify' }, { status: 409 });
	}

	const { error: updateErr } = await supabaseAdmin
		.from('product_variants')
		.update({ stock_qty: body.stock_qty })
		.eq('id', params.variantId);

	if (updateErr) {
		return json({ error: updateErr.message }, { status: 500 });
	}

	return json({ ok: true });
};
