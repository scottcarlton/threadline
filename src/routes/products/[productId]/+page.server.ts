import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

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
		.select('*, product_variants(*), product_images(*)')
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
		.eq('organization_id', organization.id)
		.eq('is_active', true)
		.order('name');

	// Style velocity for this product — orders in last 30 and 90 days.
	const styleNumber = product.style_number;
	const now = new Date();
	const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
	const d90 = new Date(now.getTime() - 90 * 86400000).toISOString();

	const { data: velocityData } = await supabase
		.from('order_lines')
		.select('qty, unit_price, orders!inner(account_id, created_at, status)')
		.eq('style_number', styleNumber)
		.is('removed_at', null)
		.gte('orders.created_at', d90)
		.neq('orders.status', 'cancelled');

	type VelocityLine = {
		qty?: number;
		unit_price?: number;
		orders?: { account_id?: string; created_at?: string; status?: string } | null;
	};
	const rawLines = (velocityData ?? []) as Array<{
		qty?: number;
		unit_price?: number;
		orders?:
			| { account_id?: string; created_at?: string; status?: string }
			| { account_id?: string; created_at?: string; status?: string }[]
			| null;
	}>;
	const lines: VelocityLine[] = rawLines.map((l) => ({
		qty: l.qty,
		unit_price: l.unit_price,
		orders: Array.isArray(l.orders) ? (l.orders[0] ?? null) : l.orders
	}));
	const last30 = lines.filter((l) => (l.orders?.created_at ?? '') >= d30);

	const velocity = {
		orders30d: new Set(last30.map((l) => l.orders?.account_id)).size,
		units30d: last30.reduce((s, l) => s + (l.qty ?? 0), 0),
		revenue30d: last30.reduce((s, l) => s + (l.qty ?? 0) * (l.unit_price ?? 0), 0),
		orders90d: new Set(lines.map((l) => l.orders?.account_id)).size,
		units90d: lines.reduce((s, l) => s + (l.qty ?? 0), 0),
		revenue90d: lines.reduce((s, l) => s + (l.qty ?? 0) * (l.unit_price ?? 0), 0)
	};

	return {
		brand,
		product,
		seasons: seasonsRes.data ?? [],
		velocity
	};
};
