import { paymentTermLabel } from '$lib/payment-methods';
import { createPdfCanvas, drawLineItemTable, drawTotalRow, type TableLine } from './pdf-layout.js';

/**
 * The invoice document.
 *
 * Deliberately not an extension of `OrderData`. An invoice carries a number,
 * an issue and due date, payment terms, tax, and an amount paid, none of which
 * an order has; and it reads its lines and bill-to from the frozen snapshot on
 * the invoice rather than live from the order. Sharing a type would mean one
 * of the two documents lying about its own shape.
 *
 * What the two documents DO share is how they look, and that lives in
 * `pdf-layout.ts`.
 */
export interface InvoiceData {
	invoice_number: string | null;
	status: string;
	issue_date: string | null;
	due_date: string | null;
	payment_terms: string | null;
	po_number: string | null;
	bill_to_name: string | null;
	bill_to_line1: string | null;
	bill_to_line2: string | null;
	bill_to_city: string | null;
	bill_to_state: string | null;
	bill_to_zip: string | null;
	bill_to_country: string | null;
	subtotal: number | string;
	shipping_amount: number | string | null;
	tax_amount: number | string | null;
	total: number | string;
	amount_paid: number | string;
	orders?: { order_number: string } | null;
	brands?: { name: string } | null;
}

function money(value: number | string | null | undefined): number {
	if (value === null || value === undefined) return 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/** Date-only strings are rendered in UTC so they do not shift by a day. */
function formatDate(value: string | null): string | null {
	if (!value) return null;
	const parsed = Date.parse(`${value}T00:00:00Z`);
	if (Number.isNaN(parsed)) return null;
	return new Date(parsed).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

export async function generateInvoicePdf(
	invoice: InvoiceData,
	lines: TableLine[]
): Promise<Uint8Array> {
	const c = await createPdfCanvas();
	const { gray } = c.colors;

	// --- Header ---
	c.text(invoice.brands?.name ?? 'Invoice', c.margin, c.y, { font: c.bold, size: 22 });
	c.y -= 24;

	// A draft has no number yet, so it is identified by its order. Printing
	// "Invoice #null" or a placeholder number on a document someone might save
	// would be worse than saying plainly that it is not issued.
	const heading = invoice.invoice_number
		? `Invoice ${invoice.invoice_number}`
		: `Draft invoice for Order #${invoice.orders?.order_number ?? ''}`.trim();
	c.text(heading, c.margin, c.y, { font: c.bold, size: 14 });

	const issued = formatDate(invoice.issue_date);
	if (issued) c.rightText(issued, c.y, { size: 11, color: gray });
	c.y -= 16;

	const due = formatDate(invoice.due_date);
	const termsLabel = invoice.payment_terms ? paymentTermLabel(invoice.payment_terms) : null;

	// `other` terms carry no schedule, so there is no due date to print. Saying
	// "Due: -" invites the reader to infer a deadline nobody agreed to.
	const leftMeta = [termsLabel ? `Terms: ${termsLabel}` : null, due ? `Due: ${due}` : null]
		.filter(Boolean)
		.join('    ');
	if (leftMeta) c.text(leftMeta, c.margin, c.y, { size: 10, color: gray });

	if (invoice.po_number) {
		c.rightText(`PO: ${invoice.po_number}`, c.y, { size: 10, color: gray });
	}
	c.y -= 10;

	c.divider();

	// --- Bill to ---
	// Read from the invoice's own frozen columns, never joined live from the
	// account: the address on a document the buyer already received must not
	// change when someone edits the account later.
	const billToLines = [
		invoice.bill_to_line1,
		invoice.bill_to_line2,
		[[invoice.bill_to_city, invoice.bill_to_state].filter(Boolean).join(', '), invoice.bill_to_zip]
			.filter(Boolean)
			.join(' ')
			.trim()
	].filter((line): line is string => Boolean(line && line.trim()));

	if (invoice.bill_to_name || billToLines.length > 0) {
		c.text('BILL TO', c.margin, c.y, { font: c.bold, size: 9, color: gray });
		c.y -= 16;

		if (invoice.bill_to_name) {
			c.text(invoice.bill_to_name, c.margin, c.y, { font: c.bold, size: 12 });
			c.y -= 15;
		}
		for (const line of billToLines) {
			c.text(line, c.margin, c.y, { size: 10 });
			c.y -= 13;
		}
		c.y -= 10;
	}

	// --- Line items ---
	drawLineItemTable(c, lines);

	c.divider();

	// --- Totals ---
	c.ensureSpace(40);

	const subtotal = money(invoice.subtotal);
	const shipping = invoice.shipping_amount === null ? null : money(invoice.shipping_amount);
	const tax = invoice.tax_amount === null ? null : money(invoice.tax_amount);
	const paid = money(invoice.amount_paid);

	c.ensureSpace(90);
	drawTotalRow(c, 'Subtotal:', subtotal);
	if (shipping !== null && shipping > 0) drawTotalRow(c, 'Shipping:', shipping);
	if (tax !== null && tax > 0) drawTotalRow(c, 'Tax:', tax);
	c.y -= 4;

	drawTotalRow(c, 'Total:', money(invoice.total), { emphasis: true });

	// Only shown once money has actually arrived. A "Balance Due" line equal to
	// the total on an unpaid invoice is noise.
	if (paid > 0) {
		c.ensureSpace(50);
		drawTotalRow(c, 'Paid:', paid);
		drawTotalRow(c, 'Balance Due:', money(invoice.total) - paid, { emphasis: true });
	}

	return c.save();
}
