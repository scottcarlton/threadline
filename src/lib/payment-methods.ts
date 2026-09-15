// Payment methods (how money moves) and payment terms (when money moves)
// are two distinct concepts. Historically Threadline stored both in a
// single `payment_preference` column, so the accepted-list surface is
// still a merged union (PAYMENT_PREFERENCES) until the split migration
// lands everywhere. New UI that renders them as separate fields should
// import PAYMENT_METHODS / PAYMENT_TERMS directly.

export const PAYMENT_METHODS = [
	{ code: 'credit_card', label: 'Credit Card' },
	{ code: 'ach', label: 'ACH / Bank Transfer' },
	{ code: 'check', label: 'Check' },
	{ code: 'wire', label: 'Wire Transfer' },
	{ code: 'other', label: 'Other' }
] as const;

// `netDays` is how many days after the invoice date payment falls due.
// `null` means the code carries no implied schedule, which is different from
// zero: zero is "due on issue", null is "we were never told".
export const PAYMENT_TERMS = [
	{ code: 'net_15', label: 'Net 15', netDays: 15 },
	{ code: 'net_30', label: 'Net 30', netDays: 30 },
	{ code: 'net_60', label: 'Net 60', netDays: 60 },
	{ code: 'net_90', label: 'Net 90', netDays: 90 },
	{ code: 'cod', label: 'COD', netDays: 0 },
	{ code: 'prepaid', label: 'Prepaid', netDays: 0 },
	{ code: 'other', label: 'Other', netDays: null }
] as const;

// Legacy merged list for callers that still treat methods + terms as
// one set (e.g. organizations.accepted_payment_methods). 'other' is
// deduped so the union has 11 distinct codes, not 12.
export const PAYMENT_PREFERENCES = [
	{ code: 'credit_card', label: 'Credit Card' },
	{ code: 'ach', label: 'ACH / Bank Transfer' },
	{ code: 'check', label: 'Check' },
	{ code: 'wire', label: 'Wire Transfer' },
	{ code: 'net_15', label: 'Net 15' },
	{ code: 'net_30', label: 'Net 30' },
	{ code: 'net_60', label: 'Net 60' },
	{ code: 'net_90', label: 'Net 90' },
	{ code: 'cod', label: 'COD' },
	{ code: 'prepaid', label: 'Prepaid' },
	{ code: 'other', label: 'Other' }
] as const;

export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number]['code'];
export type PaymentTermCode = (typeof PAYMENT_TERMS)[number]['code'];
export type PaymentPreferenceCode = (typeof PAYMENT_PREFERENCES)[number]['code'];

const METHOD_CODES = new Set<string>(PAYMENT_METHODS.map((m) => m.code));
const TERM_CODES = new Set<string>(PAYMENT_TERMS.map((t) => t.code));
const PREFERENCE_CODES = new Set<string>(PAYMENT_PREFERENCES.map((p) => p.code));

export function isPaymentMethodCode(value: unknown): value is PaymentMethodCode {
	return typeof value === 'string' && METHOD_CODES.has(value);
}

export function isPaymentTermCode(value: unknown): value is PaymentTermCode {
	return typeof value === 'string' && TERM_CODES.has(value);
}

export function isPaymentPreferenceCode(value: unknown): value is PaymentPreferenceCode {
	return typeof value === 'string' && PREFERENCE_CODES.has(value);
}

export function paymentMethodLabel(code: string | null | undefined): string {
	if (!code) return 'Not set';
	return (
		PAYMENT_METHODS.find((m) => m.code === code)?.label ??
		PAYMENT_TERMS.find((t) => t.code === code)?.label ??
		code
	);
}

export function paymentTermLabel(code: string | null | undefined): string {
	if (!code) return 'Not set';
	return PAYMENT_TERMS.find((t) => t.code === code)?.label ?? code;
}

/**
 * Returns the merged list of methods + terms an org offers, in canonical
 * order, filtered by the org's accepted_payment_methods. Preserves the
 * legacy conflated behavior for callers that still treat them as one set.
 * For the split Finalize UI, see acceptedMethodsOnly / acceptedTermsOnly.
 */
export function acceptedPaymentMethods(
	accepted: readonly string[] | null | undefined,
	includeCode?: string | null
): Array<{ code: string; label: string }> {
	const acceptedSet = new Set<string>(accepted ?? []);
	const base: Array<{ code: string; label: string }> = PAYMENT_PREFERENCES.filter((p) =>
		acceptedSet.has(p.code)
	).map((p) => ({ code: p.code as string, label: p.label as string }));
	if (includeCode && !acceptedSet.has(includeCode)) {
		base.push({ code: includeCode, label: paymentMethodLabel(includeCode) });
	}
	return base;
}

export function acceptedMethodsOnly(
	accepted: readonly string[] | null | undefined,
	includeCode?: string | null
): Array<{ code: string; label: string }> {
	const acceptedSet = new Set<string>(accepted ?? []);
	const base: Array<{ code: string; label: string }> = PAYMENT_METHODS.filter((m) =>
		acceptedSet.has(m.code)
	).map((m) => ({ code: m.code as string, label: m.label as string }));
	if (includeCode && isPaymentMethodCode(includeCode) && !acceptedSet.has(includeCode)) {
		base.push({ code: includeCode, label: paymentMethodLabel(includeCode) });
	}
	return base;
}

export function acceptedTermsOnly(
	accepted: readonly string[] | null | undefined,
	includeCode?: string | null
): Array<{ code: string; label: string }> {
	const acceptedSet = new Set<string>(accepted ?? []);
	const base: Array<{ code: string; label: string }> = PAYMENT_TERMS.filter((t) =>
		acceptedSet.has(t.code)
	).map((t) => ({ code: t.code as string, label: t.label as string }));
	if (includeCode && isPaymentTermCode(includeCode) && !acceptedSet.has(includeCode)) {
		base.push({ code: includeCode, label: paymentTermLabel(includeCode) });
	}
	return base;
}

/**
 * The date an invoice on these terms falls due, as `YYYY-MM-DD`.
 *
 * Returns null when the terms imply no schedule (`other`, or an unrecognized
 * code). That is deliberate: an invoice with an invented due date silently
 * becomes "overdue" and starts chasing a buyer who was never given a
 * deadline. A blank due date is the honest rendering of "we do not know".
 *
 * Date-only arithmetic in UTC. Terms are counted in calendar days, so a
 * local-timezone Date would shift the result by a day either side of
 * midnight depending on where the server happens to run.
 */
export function dueDateFromTerms(
	code: string | null | undefined,
	issueDate: string
): string | null {
	if (!code) return null;
	const term = PAYMENT_TERMS.find((t) => t.code === code);
	if (!term || term.netDays === null) return null;

	const parsed = Date.parse(`${issueDate}T00:00:00Z`);
	if (Number.isNaN(parsed)) return null;

	const due = new Date(parsed + term.netDays * 24 * 60 * 60 * 1000);
	return due.toISOString().slice(0, 10);
}
