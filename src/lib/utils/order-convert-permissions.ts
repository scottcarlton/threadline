/**
 * Who may convert a note into a submitted order.
 *
 * The convert action runs through `supabaseAdmin`, so RLS never sees it and
 * the app layer is the only gate. That makes it the app layer's job to
 * reproduce what RLS would have said.
 *
 * Own-org: any writing role may convert their own org's note, matching the
 * `Admin/owner/member/sales can update orders` policy.
 *
 * Federated (a brand org acting on a rep-owned note reached through an active
 * `federated_order_links` row): admin/owner only, matching
 * `Brand admin updates federated order status`
 * (`supabase/migrations/20260901000001_fix_orders_update_recursion.sql`).
 * Converting sets `status: 'submitted'`, so it is a federated status change
 * and answers to the same rule. A BLSR (`sales` in a brand org) is out.
 */

/** Roles that may write orders in their own org. */
export const ORDER_WRITE_ROLES = new Set(['admin', 'owner', 'member', 'sales']);

/** Roles that may change status on an order federated from another org. */
export const FEDERATED_ORDER_STATUS_ROLES = new Set(['admin', 'owner']);

export function mayConvertNote(role: string, isFederated: boolean): boolean {
	return isFederated ? FEDERATED_ORDER_STATUS_ROLES.has(role) : ORDER_WRITE_ROLES.has(role);
}

export const FEDERATED_CONVERT_DENIED_ERROR =
	'Only an admin or owner can convert a note shared from a connected organization.';
