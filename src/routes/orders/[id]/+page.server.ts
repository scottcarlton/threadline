import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase } = locals;

	const [orderResult, linesResult] = await Promise.all([
		supabase
			.from('orders')
			.select('*, brands(name), accounts(business_name), seasons(name), shows(name)')
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

	return {
		order: orderResult.data,
		lines: linesResult.data ?? []
	};
};
