import { createPdfCanvas, drawLineItemTable, drawTotalRow, type TableLine } from './pdf-layout.js';

/**
 * The credit memo document.
 *
 * Its own shape rather than an extension of `InvoiceData`, for the reason
 * invoice-pdf.ts gives about orders: a credit memo has an RA number, a memo
 * number, deductions and possibly a credited invoice, and none of an invoice's
 * terms, due date or payments. What it shares with the invoice is how it looks,
 * through `pdf-layout.ts`.
 *
 * Every amount is read from the issued memo's frozen columns. Nothing here
 * recomputes: the document states what was issued.
 */
export interface CreditMemoData {
	credit_memo_number: string;
	credit_memo_issued_at: string | null;
	ra_number: string | null;
	credit_subtotal: number | string;
	restocking_fee: number | string;
	shipping_deduction: number | string;
	credit_tax: number | string;
	credit_total: number | string;
	brandName: string | null;
	/** The invoice this memo credits, when the return came from an invoiced order. */
	appliedInvoiceNumber: string | null;
	/** Whether the tax sat inside the prices, so it is stated but not added. */
	taxInclusive: boolean;
	billTo: {
		name: string | null;
		line1: string | null;
		line2: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
	};
}

function money(value: number | string | null | undefined): number {
	if (value === null || value === undefined) return 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function formatDate(value: string | null): string | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) return null;
	return new Date(parsed).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

export async function generateCreditMemoPdf(
	memo: CreditMemoData,
	lines: TableLine[]
): Promise<Uint8Array> {
	const c = await createPdfCanvas();
	const { gray } = c.colors;

	// --- Header ---
	c.text(memo.brandName ?? 'Credit memo', c.margin, c.y, { font: c.bold, size: 22 });
	c.y -= 24;

	c.text(`Credit memo ${memo.credit_memo_number}`, c.margin, c.y, { font: c.bold, size: 14 });
	const issued = formatDate(memo.credit_memo_issued_at);
	if (issued) c.rightText(issued, c.y, { size: 11, color: gray });
	c.y -= 16;

	// The two references an accountant reconciles against: the return that
	// authorised it and the invoice it reduces.
	const refs = [
		memo.ra_number ? `Return: ${memo.ra_number}` : null,
		memo.appliedInvoiceNumber ? `Credits invoice: ${memo.appliedInvoiceNumber}` : null
	]
		.filter(Boolean)
		.join('    ');
	if (refs) c.text(refs, c.margin, c.y, { size: 10, color: gray });
	c.y -= 10;

	c.divider();

	// --- Credit to ---
	const b = memo.billTo;
	const addressLines = [
		b.line1,
		b.line2,
		[[b.city, b.state].filter(Boolean).join(', '), b.zip].filter(Boolean).join(' ').trim()
	].filter((line): line is string => Boolean(line && line.trim()));

	if (b.name || addressLines.length > 0) {
		c.text('CREDIT TO', c.margin, c.y, { font: c.bold, size: 9, color: gray });
		c.y -= 16;
		if (b.name) {
			c.text(b.name, c.margin, c.y, { font: c.bold, size: 12 });
			c.y -= 15;
		}
		for (const line of addressLines) {
			c.text(line, c.margin, c.y, { size: 10 });
			c.y -= 13;
		}
		c.y -= 10;
	}

	// --- Returned items ---
	drawLineItemTable(c, lines);

	c.divider();

	// --- Breakdown ---
	// Every deduction is printed when it applies, so the memo shows how the
	// credit was reached and not only where it landed.
	c.ensureSpace(110);
	drawTotalRow(c, 'Merchandise:', money(memo.credit_subtotal));

	const fee = money(memo.restocking_fee);
	if (fee > 0) drawTotalRow(c, 'Restocking fee:', fee, { deduction: true });

	const shipping = money(memo.shipping_deduction);
	if (shipping > 0) drawTotalRow(c, 'Return shipping:', shipping, { deduction: true });

	const tax = money(memo.credit_tax);
	if (tax > 0) drawTotalRow(c, memo.taxInclusive ? 'Tax (included):' : 'Tax:', tax);
	c.y -= 4;

	drawTotalRow(c, 'Credit:', money(memo.credit_total), { emphasis: true });

	return c.save();
}
