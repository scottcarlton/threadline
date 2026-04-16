import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, `/shop/${params.productId}`);
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const [brandRes, productRes, seasonsRes] = await Promise.all([
		supabase.from('brands').select('id, name').eq('id', params.id).single(),
		supabase
			.from('products')
			.select('*, product_variants(*), product_images(*)')
			.eq('id', params.productId)
			.eq('brand_id', params.id)
			.single(),
		supabase
			.from('seasons')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('name')
	]);

	if (brandRes.error || !brandRes.data) throw error(404, 'Brand not found');
	if (productRes.error || !productRes.data) throw error(404, 'Product not found');

	// Style velocity for this product — orders in last 30 and 90 days
	const styleNumber = productRes.data.style_number;
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
	// Supabase may return the joined `orders` as object or array — normalize to single object.
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
		brand: brandRes.data,
		product: productRes.data,
		seasons: seasonsRes.data ?? [],
		velocity
	};
};
