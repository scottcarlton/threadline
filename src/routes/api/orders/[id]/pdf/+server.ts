import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { generateOrderPdf } from '$lib/server/pdf';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.session || !locals.user) {
		return error(401, 'Unauthorized');
	}

	const orderId = params.id;

	const [orderResult, linesResult] = await Promise.all([
		supabaseAdmin
			.from('orders')
			.select(
				'*, brands(name, contact_first_name, contact_last_name, contact_email, contact_phone), accounts(business_name, contact_first_name, contact_last_name, contact_email, phone, address_line1, address_line2, city, state, zip, country), seasons(name), shows(name)'
			)
			.eq('id', orderId)
			.single(),
		supabaseAdmin.from('order_lines').select('*').eq('order_id', orderId).order('sort_order')
	]);

	if (orderResult.error || !orderResult.data) {
		return error(404, 'Order not found');
	}

	const order = orderResult.data;
	const lines = linesResult.data ?? [];

	const pdfBytes = await generateOrderPdf(order, lines);

	return new Response(pdfBytes as Uint8Array & BlobPart, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="order-${order.order_number}.pdf"`
		}
	});
};
