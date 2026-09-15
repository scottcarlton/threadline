import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { logSupabaseError } from '$lib/server/log-supabase-error.js';
import { remainingReturnable } from '$lib/server/returns/credit.js';

/**
 * Lines of one order, with how much of each is still returnable.
 *
 * The order read goes through `locals.supabase`, so RLS decides whether the
 * caller may see it at all; an order they cannot see is a 404, identical to a
 * bad id.
 *
 * The prior-returns read uses `supabaseAdmin` for the same reason the create
 * action does: a buyer sees only returns for their own account, so an
 * RLS-scoped sum would miss one the brand logged and offer back quantity that
 * is already gone. It is keyed to an order the caller was just authorized
 * against and returns nothing but quantities.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const orderId = url.searchParams.get('order');
	if (!orderId) throw error(400, 'Missing order');

	const orderResult = await locals.supabase
		.from('orders')
		.select('id, status')
		.eq('id', orderId)
		.maybeSingle();

	if (orderResult.error) {
		logSupabaseError('returns/new/lines order', orderResult.error);
		throw error(500, 'Could not load that order');
	}
	if (!orderResult.data) throw error(404, 'Order not found');

	const linesResult = await locals.supabase
		.from('order_lines')
		.select('id, style_number, description, color, size, qty, unit_price, variant_id')
		.eq('order_id', orderId)
		.order('sort_order');

	if (linesResult.error) {
		logSupabaseError('returns/new/lines order_lines', linesResult.error);
		throw error(500, 'Could not load the order items');
	}

	const priorResult = await supabaseAdmin
		.from('return_lines')
		.select('order_line_id, qty, return_authorizations!inner(order_id, status)')
		.eq('return_authorizations.order_id', orderId)
		.not('order_line_id', 'is', null);

	if (priorResult.error) {
		logSupabaseError('returns/new/lines prior', priorResult.error);
		throw error(500, 'Could not check what has already been returned');
	}

	const priorRows = (priorResult.data ?? []) as unknown as Array<{
		order_line_id: string;
		qty: number;
		return_authorizations: { status: string } | { status: string }[] | null;
	}>;

	// A declined or cancelled return gave its goods back; counting it would
	// permanently shrink what may be returned.
	const prior = priorRows
		.filter((r) => {
			const parent = r.return_authorizations;
			const status = (Array.isArray(parent) ? parent[0] : parent)?.status;
			return status !== 'declined' && status !== 'cancelled';
		})
		.map((r) => ({ orderLineId: r.order_line_id, qty: Number(r.qty) }));

	const rows = (linesResult.data ?? []) as Array<{
		id: string;
		style_number: string | null;
		description: string | null;
		color: string | null;
		size: string | null;
		qty: number;
		unit_price: number | string;
		variant_id: string | null;
	}>;

	const remaining = remainingReturnable(
		rows.map((l) => ({ orderLineId: l.id, orderedQty: Number(l.qty) })),
		prior
	);

	return json({
		lines: rows.map((l) => ({
			orderLineId: l.id,
			variantId: l.variant_id,
			styleNumber: l.style_number ?? '',
			description: l.description ?? '',
			color: l.color ?? '',
			size: l.size ?? '',
			orderedQty: Number(l.qty),
			remainingQty: remaining.get(l.id) ?? 0,
			unitPrice: Number(l.unit_price)
		}))
	});
};
