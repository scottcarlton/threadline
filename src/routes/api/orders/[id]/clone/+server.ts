import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { notifyOrgMembers } from '$lib/server/notifications';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.session || !locals.user) {
		return error(401, 'Unauthorized');
	}

	const orderId = params.id;

	const [orderResult, linesResult] = await Promise.all([
		supabaseAdmin
			.from('orders')
			.select('*')
			.eq('id', orderId)
			.single(),
		supabaseAdmin
			.from('order_lines')
			.select('*')
			.eq('order_id', orderId)
			.is('removed_at', null)
			.order('sort_order')
	]);

	if (orderResult.error || !orderResult.data) {
		return error(404, 'Order not found');
	}

	const source = orderResult.data;

	const { data: newOrder, error: insertErr } = await supabaseAdmin
		.from('orders')
		.insert({
			organization_id: source.organization_id,
			account_id: source.account_id,
			brand_id: source.brand_id,
			season_id: source.season_id,
			order_year: source.order_year,
			show_id: source.show_id,
			show_date_id: source.show_date_id,
			source_type_id: source.source_type_id,
			delivery_id: source.delivery_id,
			expected_ship_date: source.expected_ship_date,
			status: 'draft',
			notes: source.notes,
			created_by: locals.user.id,
			connection_id: source.connection_id
		})
		.select('id, order_number')
		.single();

	if (insertErr || !newOrder) {
		return error(500, insertErr?.message ?? 'Failed to clone order');
	}

	const lines = linesResult.data ?? [];
	if (lines.length > 0) {
		const { error: lineErr } = await supabaseAdmin.from('order_lines').insert(
			lines.map((l: any, i: number) => ({
				order_id: newOrder.id,
				product_id: l.product_id,
				variant_id: l.variant_id,
				style_number: l.style_number,
				description: l.description,
				color: l.color,
				size: l.size,
				qty: l.qty,
				unit_price: l.unit_price,
				sort_order: i
			}))
		);

		if (lineErr) {
			await supabaseAdmin.from('orders').delete().eq('id', newOrder.id);
			return error(500, 'Failed to clone line items');
		}
	}

	notifyOrgMembers(source.organization_id, locals.user.id, {
		type: 'order_cloned',
		title: `Order ${newOrder.order_number} cloned`,
		body: `Cloned from ${source.order_number ?? 'an existing order'}`,
		link: `/orders/${newOrder.id}`
	});

	return json({ id: newOrder.id, order_number: newOrder.order_number });
};
