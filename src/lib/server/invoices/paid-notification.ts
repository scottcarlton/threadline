/**
 * Whether recording a payment just settled an invoice.
 *
 * `invoices.status` is derived by `recalc_invoice_amount_paid()`, so the app
 * layer does not decide when an invoice becomes paid -- it observes it, by
 * comparing the status before the payment landed with the status after.
 *
 * The edge worth having a name for is the second payment against an
 * already-settled invoice. Overpayment is allowed, so `paid -> paid` is a
 * perfectly ordinary transition, and a naive `after === 'paid'` check would
 * announce "invoice paid" every time money arrived against it. Only the
 * crossing counts.
 */
export function invoiceJustSettled(
	statusBefore: string,
	statusAfter: string | null | undefined
): boolean {
	return statusAfter === 'paid' && statusBefore !== 'paid';
}

/** Copy for the notification, kept next to the rule that fires it. */
export function invoicePaidNotification(invoice: {
	id: string;
	invoice_number: string | null;
	total: number | string | null;
}): { type: string; title: string; body: string; link: string } {
	const amount = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(Number(invoice.total ?? 0));

	// An invoice always has a number by the time it can be paid: numbering
	// happens on send, and a draft cannot take a payment. The fallback exists so
	// a malformed row degrades to a readable sentence rather than "Invoice null".
	const label = invoice.invoice_number ?? 'An invoice';

	return {
		type: 'invoice_paid',
		title: 'Invoice paid',
		body: `${label} has been paid in full (${amount})`,
		link: `/invoices/${invoice.id}`
	};
}
