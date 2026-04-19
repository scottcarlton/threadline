export const PAYMENT_METHODS = [
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

const CODES = new Set<string>(PAYMENT_METHODS.map((m) => m.code));

export function isPaymentMethodCode(value: unknown): value is PaymentMethodCode {
	return typeof value === 'string' && CODES.has(value);
}

export function paymentMethodLabel(code: string | null | undefined): string {
	if (!code) return 'Not set';
	return PAYMENT_METHODS.find((m) => m.code === code)?.label ?? code;
}

/**
 * Returns the list of methods an org offers, in canonical order, filtered by
 * the org's accepted_payment_methods. If `includeCode` is supplied and isn't
 * already in the accepted list, it's appended (keeps grandfathered values
 * selectable in edit UIs without re-adding them org-wide).
 */
export function acceptedPaymentMethods(
	accepted: readonly string[] | null | undefined,
	includeCode?: string | null
): Array<{ code: string; label: string }> {
	const acceptedSet = new Set<string>(accepted ?? []);
	const base: Array<{ code: string; label: string }> = PAYMENT_METHODS.filter((m) =>
		acceptedSet.has(m.code)
	).map((m) => ({ code: m.code as string, label: m.label as string }));
	if (includeCode && !acceptedSet.has(includeCode)) {
		base.push({ code: includeCode, label: paymentMethodLabel(includeCode) });
	}
	return base;
}
