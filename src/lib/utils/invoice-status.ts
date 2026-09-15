import type { Invoice, InvoiceLine, InvoicePayment } from '$lib/types/database';

/** An invoice as the list renders it, with the joins the list needs. */
export type InvoiceListRow = Invoice & {
	orders: { order_number: string } | null;
	accounts: { business_name: string } | null;
	brands: { name: string } | null;
};

/** One invoice plus its frozen snapshot and payment history. */
export type InvoiceDetail = InvoiceListRow & {
	invoice_lines: InvoiceLine[];
	invoice_payments: InvoicePayment[];
};

/**
 * Pure display logic for invoices, used by both the server query layer and the
 * pages that render it. Lives in utils rather than server/ precisely because
 * the list page needs it in the browser: `$lib/server/**` is server-only and
 * importing it from a component breaks the build.
 */

/**
 * The status a person sees, which is not always the status in the column.
 *
 * `overdue` is derived here and never stored. Storing it would need a nightly
 * job to stay honest, and an invoice that silently stops being overdue because
 * a cron failed is worse than one computed on every read.
 *
 * An invoice with no due date is never overdue. That is not an oversight: it
 * is how `other` payment terms land (see `dueDateFromTerms`), and inventing a
 * deadline in order to chase someone for missing it would be the actual bug.
 */
export type InvoiceDisplayStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'void' | 'overdue';

/**
 * Accepts the loose shape PostgREST actually returns rather than the strict
 * `Invoice` type: NUMERIC columns arrive as strings and enum columns as plain
 * strings. Demanding the strict type would push a cast onto every call site,
 * which is how a wrong cast eventually gets written.
 */
export function invoiceDisplayStatus(
	invoice: { status: string; due_date: string | null },
	today: string
): InvoiceDisplayStatus {
	const status = invoice.status as InvoiceDisplayStatus;
	if (status !== 'sent' && status !== 'partial') return status;
	if (!invoice.due_date) return status;
	return invoice.due_date < today ? 'overdue' : status;
}

/** What is still owed. Void invoices owe nothing regardless of their total. */
export function invoiceBalance(invoice: {
	status: string;
	total: number | string | null;
	amount_paid: number | string | null;
}): number {
	if (invoice.status === 'void') return 0;
	return Number(invoice.total ?? 0) - Number(invoice.amount_paid ?? 0);
}

export type InvoiceMetrics = {
	outstanding: number;
	outstandingCount: number;
	overdue: number;
	overdueCount: number;
	draftCount: number;
	paidThisPeriod: number;
};

/**
 * The three numbers a brand actually wants on this screen: what is owed, what
 * is late, and what has landed. Drafts are counted but carry no money, because
 * an unsent invoice is not owed anything yet.
 */
export function computeInvoiceMetrics(
	invoices: Array<{
		status: string;
		due_date: string | null;
		total: number | string | null;
		amount_paid: number | string | null;
	}>,
	today: string
): InvoiceMetrics {
	let outstanding = 0;
	let outstandingCount = 0;
	let overdue = 0;
	let overdueCount = 0;
	let draftCount = 0;
	let paidThisPeriod = 0;

	for (const invoice of invoices) {
		const display = invoiceDisplayStatus(invoice, today);

		if (display === 'draft') {
			draftCount += 1;
			continue;
		}
		if (display === 'void') continue;

		if (display === 'paid') {
			paidThisPeriod += Number(invoice.total ?? 0);
			continue;
		}

		const balance = invoiceBalance(invoice);
		outstanding += balance;
		outstandingCount += 1;

		if (display === 'overdue') {
			overdue += balance;
			overdueCount += 1;
		}
	}

	return {
		outstanding,
		outstandingCount,
		overdue,
		overdueCount,
		draftCount,
		paidThisPeriod
	};
}
