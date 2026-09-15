import { supabaseAdmin } from '$lib/server/supabase';

/**
 * Invoices use a third federation shape and it has to be reproduced in the app
 * layer wherever `supabaseAdmin` bypasses RLS -- see
 * docs/brd/permissions-implementation-map.md §A.3, "Invoice tables
 * (denormalized federation keys)".
 *
 * This is the single place that rule lives, the same role
 * `loadOrderForOrg` plays for orders. That helper exists because
 * `/api/orders/[id]/lines` was the only endpoint that had the rule right;
 * invoices start with one home rather than earning it the hard way.
 *
 * Three readers, three different columns:
 *
 *   brand  -> organization_id, the issuing org
 *   rep    -> order_org_id, the org that owns the order, sent invoices only
 *   buyer  -> account_id, sent invoices only
 *
 * A draft is visible only inside the issuing brand org.
 */

export type InvoiceRow = {
	id: string;
	organization_id: string;
	order_org_id: string;
	account_id: string | null;
	status: string;
};

/** Columns the authorization check itself depends on. Callers may ask for more. */
const REQUIRED_COLUMNS = 'id, organization_id, order_org_id, account_id, status';

/**
 * Load an invoice only if `orgId` may see it: it issued the invoice, or the
 * invoice is for an order in that org and has been sent.
 *
 * Returns `null` for both "not found" and "not authorized" so callers surface
 * a 404 either way and invoice existence does not leak across tenants.
 *
 * `select` must include the columns in REQUIRED_COLUMNS; pass extra columns
 * rather than replacing them, so this stays a single query.
 */
export async function loadInvoiceForOrg<T extends InvoiceRow = InvoiceRow>(
	invoiceId: string,
	orgId: string,
	select: string = REQUIRED_COLUMNS
): Promise<T | null> {
	const { data, error } = await supabaseAdmin
		.from('invoices')
		.select(select)
		.eq('id', invoiceId)
		.single();

	if (error || !data) return null;

	const invoice = data as unknown as T;

	// The issuing brand org sees everything it has issued, drafts included.
	if (invoice.organization_id === orgId) return invoice;

	// The rep org that owns the order sees it once it has been sent. A draft is
	// the brand's working document and stays inside the brand org.
	if (invoice.order_org_id === orgId && invoice.status !== 'draft') return invoice;

	return null;
}

/**
 * Own-org-only variant, for anything that issues or alters an invoice.
 *
 * Reading a sent invoice is shared with the rep side; sending, voiding, and
 * recording payment are not. The brand owns the document, so those paths must
 * refuse to follow the federation arm even when the caller can legitimately
 * read the row.
 */
export async function loadIssuingOrgInvoice<T extends InvoiceRow = InvoiceRow>(
	invoiceId: string,
	orgId: string,
	select: string = REQUIRED_COLUMNS
): Promise<T | null> {
	const { data, error } = await supabaseAdmin
		.from('invoices')
		.select(select)
		.eq('id', invoiceId)
		.eq('organization_id', orgId)
		.single();

	if (error || !data) return null;
	return data as unknown as T;
}
