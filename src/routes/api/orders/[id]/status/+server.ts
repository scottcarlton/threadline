import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendOrderEmail } from '$lib/server/order-emails.js';
import type { OrderEmailEvent } from '$lib/server/order-emails.js';
import { createNotification, notifyBrandAdmins } from '$lib/server/notifications.js';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
	draft: ['submitted'],
	submitted: ['confirmed'],
	confirmed: ['shipped'],
	shipped: ['delivered']
};

const TIMESTAMP_FIELD: Record<string, string> = {
	submitted: 'submitted_at',
	confirmed: 'confirmed_at',
	shipped: 'shipped_at',
	delivered: 'delivered_at',
	cancelled: 'cancelled_at'
};

const EMAIL_EVENTS: Record<string, OrderEmailEvent> = {
	submitted: 'submitted',
	confirmed: 'confirmed',
	shipped: 'shipped'
};

export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
	const { supabase, organization, user } = locals;
	if (!organization || !user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { status: newStatus } = await request.json();
	if (!newStatus || typeof newStatus !== 'string') {
		return json({ error: 'Missing status' }, { status: 400 });
	}

	const { data: order, error: fetchErr } = await supabase
		.from('orders')
		.select('id, order_number, status, total_amount, brand_id, account_id, created_by')
		.eq('id', params.id)
		.single();

	if (fetchErr || !order) {
		return json({ error: 'Order not found' }, { status: 404 });
	}

	const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
	if (!allowed.includes(newStatus)) {
		return json(
			{ error: `Cannot transition from ${order.status} to ${newStatus}` },
			{ status: 400 }
		);
	}

	const updateData: Record<string, unknown> = {
		status: newStatus,
		updated_at: new Date().toISOString()
	};
	if (TIMESTAMP_FIELD[newStatus]) {
		updateData[TIMESTAMP_FIELD[newStatus]] = new Date().toISOString();
	}

	const { error: updateErr } = await supabase.from('orders').update(updateData).eq('id', order.id);

	if (updateErr) {
		return json({ error: updateErr.message }, { status: 500 });
	}

	const emailEvent = EMAIL_EVENTS[newStatus];
	if (emailEvent) {
		sendOrderEmail(emailEvent, order, url.origin);
	}

	const orderLink = `/orders/${order.id}`;
	if (newStatus === 'submitted') {
		notifyBrandAdmins(order.brand_id, user.id, {
			type: 'order_submitted',
			title: 'New order submitted',
			body: `Order ${order.order_number} has been submitted`,
			link: orderLink
		});
	} else if (newStatus === 'confirmed') {
		createNotification({
			organizationId: organization.id,
			userId: order.created_by,
			type: 'order_confirmed',
			title: 'Order confirmed',
			body: `Order ${order.order_number} has been confirmed`,
			link: orderLink
		});
	} else if (newStatus === 'shipped') {
		createNotification({
			organizationId: organization.id,
			userId: order.created_by,
			type: 'order_shipped',
			title: 'Order shipped',
			body: `Order ${order.order_number} has shipped`,
			link: orderLink
		});
	}

	return json({ success: true, status: newStatus });
};
