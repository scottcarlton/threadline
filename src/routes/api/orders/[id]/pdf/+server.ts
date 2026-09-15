import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { generateOrderPdf, type OrderData } from '$lib/server/pdf';
import { loadOrderForOrg, type OrderRow } from '$lib/server/orders/authorize-order';

type OrderForPdf = OrderRow & OrderData;

// docs/brd/roles-permissions.md §4.4: "Generate order PDF" is Yes/Yes/Scoped/
// Scoped/No — guest is excluded. Brand scoping for member/sales is enforced by
// RLS on the underlying order.
const PDF_ROLES = new Set(['admin', 'owner', 'member', 'sales']);

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return error(401, 'Unauthorized');
	}

	if (!PDF_ROLES.has(locals.membership?.role ?? '')) {
		return error(403, 'Insufficient permissions to generate an order PDF.');
	}

	const orderId = params.id;

	// Own-org or actively-federated only. Without this, any authenticated user
	// could pull any order's PDF by ID.
	const order = await loadOrderForOrg<OrderForPdf>(
		orderId,
		locals.organization.id,
		'*, brands(name, contact_first_name, contact_last_name, contact_email, contact_phone), accounts(business_name, contact_first_name, contact_last_name, contact_email, phone, address_line1, address_line2, city, state, zip, country), seasons(name), shows(name)'
	);

	if (!order) {
		return error(404, 'Order not found');
	}

	const { data: linesData } = await supabaseAdmin
		.from('order_lines')
		.select('*')
		.eq('order_id', orderId)
		.order('sort_order');

	const lines = linesData ?? [];

	const pdfBytes = await generateOrderPdf(order, lines);

	return new Response(pdfBytes as Uint8Array & BlobPart, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="order-${order.order_number}.pdf"`
		}
	});
};
