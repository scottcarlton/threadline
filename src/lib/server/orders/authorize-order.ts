import { supabaseAdmin } from '$lib/server/supabase';

// Orders use *explicit* federation (`federated_order_links`), not the implicit
// `get_connected_org_ids()` mechanism — see
// docs/brd/permissions-implementation-map.md §A.6. Any endpoint that reads an
// order through `supabaseAdmin` (bypassing RLS) must reproduce that rule in the
// app layer, or it becomes a cross-tenant read of accounts, line items, and
// wholesale pricing.
//
// This helper is the single place that rule lives. It was extracted from
// `/api/orders/[id]/lines`, which was the only endpoint that had it right.

export type OrderRow = { id: string; organization_id: string };

/**
 * Load an order only if `orgId` is allowed to see it: either the order belongs
 * to that org, or there is an *active* federated link pointing at it (the
 * brand-org side of a rep's order).
 *
 * Returns `null` for both "not found" and "not authorized" so callers surface a
 * 404 either way and don't leak order existence across tenants.
 *
 * `select` must include `organization_id` — the authorization check depends on
 * it. Callers pass the columns they actually need so this stays a single query.
 */
export async function loadOrderForOrg<T extends OrderRow = OrderRow>(
	orderId: string,
	orgId: string,
	select: string = 'id, organization_id'
): Promise<T | null> {
	const { data, error } = await supabaseAdmin
		.from('orders')
		.select(select)
		.eq('id', orderId)
		.single();

	if (error || !data) return null;

	const order = data as unknown as T;

	if (order.organization_id === orgId) return order;

	const { data: link } = await supabaseAdmin
		.from('federated_order_links')
		.select('id')
		.eq('order_id', order.id)
		.eq('target_org_id', orgId)
		.eq('status', 'active')
		.maybeSingle();

	return link ? order : null;
}

/**
 * Own-org-only variant. Use for writes that must land in the caller's own org:
 * a brand org can read and act on a federated order, but per §A.6 it cannot
 * create orders in the rep org, so cloning must not follow the federation path.
 */
export async function loadOwnOrgOrder<T extends OrderRow = OrderRow>(
	orderId: string,
	orgId: string,
	select: string = 'id, organization_id'
): Promise<T | null> {
	const { data, error } = await supabaseAdmin
		.from('orders')
		.select(select)
		.eq('id', orderId)
		.eq('organization_id', orgId)
		.single();

	if (error || !data) return null;
	return data as unknown as T;
}
