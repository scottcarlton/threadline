import { supabaseAdmin } from '$lib/server/supabase';

/**
 * The single place the return read rule lives for `supabaseAdmin` callers.
 *
 * Same role `loadInvoiceForOrg` plays for invoices, and it exists for the same
 * reason: `supabaseAdmin` bypasses RLS, so any endpoint using it has to
 * reproduce the policy or it becomes a cross-tenant read. `/api/orders/[id]/pdf`
 * shipped exactly that once (SCO-165).
 *
 * `return_authorizations.organization_id` is the **issuing brand org**. On a
 * federated order that is not `orders.organization_id`, which is always the rep
 * org, so `order_org_id` carries the second one.
 */

export type ReturnRow = {
	id: string;
	organization_id: string;
	order_org_id: string | null;
	account_id: string | null;
	status: string;
};

const REQUIRED_COLUMNS = 'id, organization_id, order_org_id, account_id, status';

/**
 * Load a return only if `orgId` issued it.
 *
 * Every transition in SCO-186 is brand-only, so there is deliberately no
 * federation arm here: a rep may read their own request, but approving,
 * declining, receiving and cancelling all belong to the brand holding the
 * goods. That mirrors `reject_non_brand_fulfillment_status()` on orders.
 *
 * Returns `null` for both "not found" and "not authorized" so callers 404
 * either way and return existence does not leak across tenants.
 */
export async function loadIssuingOrgReturn<T extends ReturnRow = ReturnRow>(
	returnId: string,
	orgId: string,
	select: string = REQUIRED_COLUMNS
): Promise<T | null> {
	const { data, error } = await supabaseAdmin
		.from('return_authorizations')
		.select(select)
		.eq('id', returnId)
		.eq('organization_id', orgId)
		.single();

	if (error || !data) return null;
	return data as unknown as T;
}
