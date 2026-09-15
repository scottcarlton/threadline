import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { notifyOrgMembers } from '$lib/server/notifications';
import { loadOwnOrgOrder, type OrderRow } from '$lib/server/orders/authorize-order';

type SourceOrder = OrderRow & {
	order_number: string | null;
	account_id: string | null;
	brand_id: string | null;
	season_id: string | null;
	order_year: number | null;
	show_id: string | null;
	show_date_id: string | null;
	channel: string | null;
	source_type_id: string | null;
	delivery_id: string | null;
	expected_ship_date: string | null;
	notes: string | null;
	connection_id: string | null;
};

// A clone is an order creation. docs/brd/roles-permissions.md §4.4 "Create
// orders" excludes guest.
const CLONE_ROLES = new Set(['admin', 'owner', 'member', 'sales']);

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return error(401, 'Unauthorized');
	}

	if (!CLONE_ROLES.has(locals.membership?.role ?? '')) {
		return error(403, 'Insufficient permissions to clone an order.');
	}

	const orderId = params.id;

	// Own-org only, deliberately narrower than the read path: the clone inserts a
	// new order into `source.organization_id`, and per §A.6 a brand org cannot
	// create orders in a rep org. Following the federation link here would let a
	// connected brand write into the rep's workspace.
	const source = await loadOwnOrgOrder<SourceOrder>(orderId, locals.organization.id, '*');

	if (!source) {
		return error(404, 'Order not found');
	}

	const { data: linesData } = await supabaseAdmin
		.from('order_lines')
		.select('*')
		.eq('order_id', orderId)
		.is('removed_at', null)
		.order('sort_order');

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
			channel: source.channel,
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

	const lines = linesData ?? [];
	if (lines.length > 0) {
		type OrderLine = {
			product_id: string | null;
			variant_id: string | null;
			style_number: string | null;
			description: string | null;
			color: string | null;
			size: string | null;
			qty: number | null;
			unit_price: number | null;
		};
		const { error: lineErr } = await supabaseAdmin.rpc('insert_order_lines_with_actor', {
			actor: locals.user.id,
			lines: (lines as OrderLine[]).map((l, i: number) => ({
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
		});

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
