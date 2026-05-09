import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendOrderEmail } from '$lib/server/order-emails.js';
import type { OrderEmailEvent } from '$lib/server/order-emails.js';
import { createNotification, notifyBrandAdmins } from '$lib/server/notifications.js';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
	draft: ['submitted'],
	submitted: ['confirmed'],
	confirmed: ['preparing', 'cancelled'],
	preparing: ['shipped', 'cancelled'],
	shipped: ['delivered']
};

const TIMESTAMP_FIELD: Record<string, string> = {
	submitted: 'submitted_at',
	confirmed: 'confirmed_at',
	preparing: 'preparing_at',
	shipped: 'shipped_at',
	delivered: 'delivered_at',
	cancelled: 'cancelled_at'
};

const EMAIL_EVENTS: Record<string, OrderEmailEvent> = {
	submitted: 'submitted',
	confirmed: 'confirmed',
	preparing: 'preparing',
	shipped: 'shipped',
	delivered: 'delivered'
};

export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
	const { supabase, organization, user, orgType } = locals;
	if (!organization || !user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const newStatus = body.status;
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

	if (newStatus === 'shipped') {
		if (body.tracking_number !== undefined)
			updateData.tracking_number = body.tracking_number || null;
		if (body.carrier !== undefined) updateData.carrier = body.carrier || null;
		if (body.shipping_cost !== undefined) {
			const cost = parseFloat(body.shipping_cost);
			updateData.shipping_cost = isNaN(cost) ? null : cost;
		}
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
	const actorIsBrand = orgType === 'brand';

	if (newStatus === 'submitted') {
		notifyBrandAdmins(order.brand_id, user.id, {
			type: 'order_submitted',
			title: 'New order submitted',
			body: `Order ${order.order_number} has been submitted`,
			link: orderLink
		});
	} else if (newStatus === 'confirmed') {
		if (actorIsBrand) {
			createNotification({
				organizationId: organization.id,
				userId: order.created_by,
				actorUserId: user.id,
				type: 'order_confirmed',
				title: 'Order confirmed',
				body: `Order ${order.order_number} has been confirmed`,
				link: orderLink
			});
		} else {
			notifyBrandAdmins(order.brand_id, user.id, {
				type: 'order_confirmed',
				title: 'Order confirmed',
				body: `Order ${order.order_number} has been confirmed`,
				link: orderLink
			});
		}
	} else if (newStatus === 'preparing') {
		createNotification({
			organizationId: organization.id,
			userId: order.created_by,
			actorUserId: user.id,
			type: 'order_preparing',
			title: 'Order preparing to ship',
			body: `Order ${order.order_number} is being prepared for shipment`,
			link: orderLink
		});
	}

	return json({ success: true, status: newStatus });
};
