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

export const PAYMENT_TERMS = [
	{ code: 'net_15', label: 'Net 15' },
	{ code: 'net_30', label: 'Net 30' },
	{ code: 'net_60', label: 'Net 60' },
	{ code: 'net_90', label: 'Net 90' },
	{ code: 'cod', label: 'COD' },
	{ code: 'prepaid', label: 'Prepaid' },
	{ code: 'other', label: 'Other' }
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
