import { z } from 'zod';

const optString = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((v) => (v && v.length ? v : undefined));

/**
 * Recording a payment against an issued invoice.
 *
 * There is no upper bound on `amount`. An overpayment is a thing that actually
 * happens, and the accounting record has to be able to represent it: the
 * invoice becomes paid and the balance goes negative, shown as a credit.
 * Rejecting it here would mean refusing to write down something that already
 * occurred.
 *
 * `method` is validated against the org's accepted methods server-side rather
 * than enumerated here, because the accepted list is per-organization. The
 * canonical codes live in src/lib/payment-methods.ts.
 */
export const recordPaymentSchema = z.object({
	amount: z.coerce
		.number({ message: 'Enter an amount' })
		.positive('Amount must be more than zero')
		.max(99_999_999, 'That amount looks wrong'),
	// Date-only, so it can be compared with due_date without timezone drift.
	paidOn: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
	method: optString(64),
	reference: optString(120),
	note: optString(500)
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/**
 * Voiding an issued invoice.
 *
 * The reason is optional but worth asking for: a voided invoice keeps its
 * number forever, and the next person to look at the gap in the sequence will
 * want to know why.
 */
export const voidInvoiceSchema = z.object({
	reason: optString(500)
});

export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;
