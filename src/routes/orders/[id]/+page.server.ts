import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase } = locals;

	const [orderResult, linesResult] = await Promise.all([
		supabase
			.from('orders')
			.select('*, brands(name, commission_rate), accounts(business_name, contact_email), seasons(name), shows(name), profiles!orders_created_by_fkey(display_name), source_types(name), season_deliveries!delivery_id(label, delivery_month, delivery_day), show_dates(id, year, month, city, state, shows(name))')
			.eq('id', params.id)
			.single(),
		supabase
			.from('order_lines')
			.select('*')
			.eq('order_id', params.id)
			.order('sort_order')
	]);

	if (orderResult.error || !orderResult.data) {
		throw error(404, 'Order not found');
	}

	// Load brand assets, commission override, and rep info in parallel
	const [brandAssetsRes, overrideRes, repRes] = await Promise.all([
		supabase
			.from('brand_assets')
			.select('*')
			.eq('brand_id', orderResult.data.brand_id)
			.order('created_at', { ascending: false }),
		supabase
			.from('commission_overrides')
			.select('rate')
			.eq('brand_id', orderResult.data.brand_id)
			.eq('account_id', orderResult.data.account_id)
			.single(),
		supabase
			.from('organization_members')
			.select('id, commission_rate, profiles!organization_members_profile_id_fkey(display_name)')
			.eq('profile_id', orderResult.data.created_by)
			.single()
	]);

	// Look up per-brand commission for the rep, fall back to their default rate
	let repCommissionRate = repRes.data?.commission_rate ?? 0;
	if (repRes.data?.id) {
		const { data: brandCommission } = await supabase
			.from('member_brand_commissions')
			.select('rate')
			.eq('member_id', repRes.data.id)
			.eq('brand_id', orderResult.data.brand_id)
			.single();
		if (brandCommission) {
			repCommissionRate = brandCommission.rate;
		}
	}

	return {
		order: orderResult.data,
		lines: linesResult.data ?? [],
		brandAssets: brandAssetsRes.data ?? [],
		commissionOverride: overrideRes.data?.rate ?? null,
		repCommissionRate,
		repName: (repRes.data?.profiles as any)?.display_name ?? null
	};
};
