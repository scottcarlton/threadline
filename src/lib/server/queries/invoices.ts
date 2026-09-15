import { supabaseAdmin } from '../supabase';
import type { QueryScope } from './scope';
import type { InvoiceDetail, InvoiceListRow } from '$lib/utils/invoice-status';

// The pure half lives in $lib/utils because the pages need it in the browser,
// and $lib/server/** is server-only. Re-exported here so server callers have a
// single import for the invoice data layer.
export {
	computeInvoiceMetrics,
	invoiceDisplayStatus,
	invoiceBalance
} from '$lib/utils/invoice-status';
export type {
	InvoiceDisplayStatus,
	InvoiceMetrics,
	InvoiceListRow,
	InvoiceDetail
} from '$lib/utils/invoice-status';

/**
 * Invoices are issued by the brand org, so `/invoices` is an own-org list:
 * `organization_id IN scope.ownOrgIds`, per §A.4. There is no federation arm
 * here. A rep sees a sent invoice on the order it belongs to (SCO-181), not in
 * a list of its own.
 */

const LIST_SELECT = '*, orders(order_number), accounts(business_name), brands(name)';

export type InvoiceFilters = { status?: string | null };

/**
 * Own-org invoices, newest first. Drafts sort alongside everything else by
 * creation time; they have no issue date to sort on.
 *
 * `status = 'overdue'` is accepted as a filter even though no row stores it.
 * It is resolved into "sent or partial, past due" here rather than making the
 * caller know that overdue is derived.
 */
export async function listInvoices(
	scope: QueryScope,
	filters: InvoiceFilters,
	today: string
): Promise<InvoiceListRow[]> {
	if (scope.kind !== 'internal') return [];
	if (scope.ownOrgIds.length === 0) return [];

	let query = supabaseAdmin
		.from('invoices')
		.select(LIST_SELECT)
		.in('organization_id', scope.ownOrgIds)
		.order('created_at', { ascending: false });

	if (filters.status === 'overdue') {
		query = query.in('status', ['sent', 'partial']).lt('due_date', today);
	} else if (filters.status) {
		query = query.eq('status', filters.status);
	}

	const { data } = await query;
	return (data ?? []) as unknown as InvoiceListRow[];
}

/**
 * One invoice with its frozen snapshot.
 *
 * Lines come from `invoice_lines`, never from a join back to `order_lines`:
 * the document must not change when someone edits the order afterwards. Same
 * reason the bill-to columns are read off the invoice rather than the account.
 */
export async function getInvoiceForOrg(
	invoiceId: string,
	scope: QueryScope
): Promise<InvoiceDetail | null> {
	if (scope.kind !== 'internal') return null;
	if (scope.ownOrgIds.length === 0) return null;

	const { data } = await supabaseAdmin
		.from('invoices')
		.select(`${LIST_SELECT}, invoice_lines(*), invoice_payments(*)`)
		.eq('id', invoiceId)
		.in('organization_id', scope.ownOrgIds)
		.maybeSingle();

	if (!data) return null;

	const invoice = data as unknown as InvoiceDetail;
	invoice.invoice_lines = [...(invoice.invoice_lines ?? [])].sort(
		(a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
	);
	invoice.invoice_payments = [...(invoice.invoice_payments ?? [])].sort((a, b) =>
		a.paid_on < b.paid_on ? 1 : -1
	);
	return invoice;
}
