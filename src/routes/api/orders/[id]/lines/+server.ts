import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { supabaseAdmin } from '$lib/server/supabase';
import { saveLineEdits, type SupabaseForLineEdits } from '$lib/server/orders/save-line-edits';
import { loadOrderForOrg, type OrderRow } from '$lib/server/orders/authorize-order';

type OrderForLineEdits = OrderRow & { status: string; order_type: string | null };

const rowSchema = z.object({
	product_id: z.string().min(1),
	color: z.string().nullable(),
	color_edit: z.string().nullable(),
	style_number: z.string(),
	name: z.string(),
	unit_price: z.number().min(0),
	qty_by_size: z.record(z.string(), z.number().int().min(0)),
	available_sizes: z.array(z.string()),
	to_remove: z.boolean().optional().default(false)
});

const bodySchema = z.object({
	rows: z.array(rowSchema)
});

// Statuses where any member can edit lines. Anything past these is locked
// unless the caller is an org admin/owner, matching the gating specified in
// docs/order-detail-redesign-plan.md §6.10.
const OPEN_STATUSES = new Set(['draft', 'submitted', 'confirmed', 'preparing']);
const ADMIN_ROLES = new Set(['admin', 'owner']);
const MEMBER_ROLES = new Set(['admin', 'owner', 'member', 'sales']);

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	const { organization, membership, session, user } = locals;
	if (!session || !organization || !user) throw error(401, 'Not authenticated');

	const role = membership?.role ?? '';
	if (!MEMBER_ROLES.has(role)) {
		throw error(403, 'Insufficient permissions to edit order lines.');
	}

	const body = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'Invalid request body');
	}

	// Same-org OR active federation link to the caller's org. BOA can act on a
	// rep-owned federated order (confirm/ship/etc.), so line edits follow. The
	// rule now lives in loadOrderForOrg, shared with the pdf/send read paths.
	const order = await loadOrderForOrg<OrderForLineEdits>(
		params.id,
		organization.id,
		'id, organization_id, status, order_type'
	);

	if (!order) throw error(404, 'Order not found');

	const isNote = order.order_type === 'note';
	const isAdmin = ADMIN_ROLES.has(role);
	if (!isNote && !OPEN_STATUSES.has(order.status) && !isAdmin) {
		throw error(409, `Cannot edit lines on a ${order.status} order`);
	}

	// Cast: supabaseAdmin's generics are too deep for structural matching against
	// the narrow interface; at runtime it satisfies the contract.
	const result = await saveLineEdits({
		supabase: supabaseAdmin as unknown as SupabaseForLineEdits,
		orderId: order.id,
		actorId: user.id,
		rows: parsed.data.rows
	});

	if (!result.ok && result.error) {
		throw error(500, result.error);
	}

	// A no-op save (the client re-submitting an unchanged grid) is not a change
	// and should not appear on the timeline as one.
	if (result.applied > 0) {
		locals.audit.record('order.lines_changed', {
			organizationId: order.organization_id,
			subjectId: order.id,
			metadata: { applied: result.applied, failed: result.failed }
		});
	}

	return json(result);
};
