import { describe, expect, it } from 'vitest';
import {
	PAYMENT_METHODS,
	PAYMENT_TERMS,
	PAYMENT_PREFERENCES,
	acceptedMethodsOnly,
	acceptedPaymentMethods,
	acceptedTermsOnly,
	isPaymentMethodCode,
	isPaymentPreferenceCode,
	isPaymentTermCode,
	paymentMethodLabel,
	paymentTermLabel
} from './payment-methods';

describe('payment-methods canonical lists', () => {
	it('methods and terms are each non-empty with unique codes', () => {
		expect(PAYMENT_METHODS.length).toBeGreaterThan(0);
		expect(PAYMENT_TERMS.length).toBeGreaterThan(0);
		const methodCodes = PAYMENT_METHODS.map((m) => m.code);
		const termCodes = PAYMENT_TERMS.map((t) => t.code);
		expect(new Set(methodCodes).size).toBe(methodCodes.length);
		expect(new Set(termCodes).size).toBe(termCodes.length);
	});

	it('preferences is the deduped union of methods and terms', () => {
		const prefCodes = new Set(PAYMENT_PREFERENCES.map((p) => p.code));
		for (const m of PAYMENT_METHODS) expect(prefCodes.has(m.code)).toBe(true);
		for (const t of PAYMENT_TERMS) expect(prefCodes.has(t.code)).toBe(true);
		// 'other' appears in both methods and terms but should be present
		// exactly once in the union.
		const others = PAYMENT_PREFERENCES.filter((p) => p.code === 'other');
		expect(others.length).toBe(1);
	});
});

describe('payment-methods validators', () => {
	it('isPaymentMethodCode narrows to method codes only', () => {
		expect(isPaymentMethodCode('credit_card')).toBe(true);
		expect(isPaymentMethodCode('ach')).toBe(true);
		expect(isPaymentMethodCode('net_30')).toBe(false);
		expect(isPaymentMethodCode('bogus')).toBe(false);
		expect(isPaymentMethodCode(null)).toBe(false);
		expect(isPaymentMethodCode(42)).toBe(false);
	});

	it('isPaymentTermCode narrows to term codes only', () => {
		expect(isPaymentTermCode('net_30')).toBe(true);
		expect(isPaymentTermCode('cod')).toBe(true);
		expect(isPaymentTermCode('credit_card')).toBe(false);
		expect(isPaymentTermCode('bogus')).toBe(false);
	});

	it('isPaymentPreferenceCode accepts either side of the split', () => {
		expect(isPaymentPreferenceCode('credit_card')).toBe(true);
		expect(isPaymentPreferenceCode('net_30')).toBe(true);
		expect(isPaymentPreferenceCode('bogus')).toBe(false);
		expect(isPaymentPreferenceCode(null)).toBe(false);
	});
});

describe('payment-methods labels', () => {
	it('paymentMethodLabel resolves from either list and falls back to the code', () => {
		expect(paymentMethodLabel('net_30')).toBe('Net 30');
		expect(paymentMethodLabel('credit_card')).toBe('Credit Card');
		expect(paymentMethodLabel('mystery')).toBe('mystery');
		expect(paymentMethodLabel(null)).toBe('Not set');
		expect(paymentMethodLabel(undefined)).toBe('Not set');
		expect(paymentMethodLabel('')).toBe('Not set');
	});

	it('paymentTermLabel resolves only from the terms list', () => {
		expect(paymentTermLabel('net_30')).toBe('Net 30');
		expect(paymentTermLabel('credit_card')).toBe('credit_card');
		expect(paymentTermLabel(null)).toBe('Not set');
	});
});

describe('acceptedPaymentMethods (merged union)', () => {
	it('returns accepted codes in canonical merged order', () => {
		const result = acceptedPaymentMethods(['net_30', 'credit_card', 'check']);
		expect(result.map((r) => r.code)).toEqual(['credit_card', 'check', 'net_30']);
	});

	it('appends a grandfathered includeCode when not in accepted list', () => {
		const result = acceptedPaymentMethods(['net_30'], 'net_60');
		expect(result.map((r) => r.code)).toEqual(['net_30', 'net_60']);
	});

	it('does not duplicate an includeCode already in accepted list', () => {
		const result = acceptedPaymentMethods(['net_30', 'net_60'], 'net_60');
		expect(result.map((r) => r.code)).toEqual(['net_30', 'net_60']);
	});

	it('handles null/undefined accepted list', () => {
		expect(acceptedPaymentMethods(null)).toEqual([]);
		expect(acceptedPaymentMethods(undefined)).toEqual([]);
		expect(acceptedPaymentMethods(null, 'net_30')).toEqual([{ code: 'net_30', label: 'Net 30' }]);
	});
});

describe('acceptedMethodsOnly / acceptedTermsOnly', () => {
	it('methods filter drops any term codes', () => {
		const result = acceptedMethodsOnly(['net_30', 'credit_card', 'check']);
		expect(result.map((r) => r.code)).toEqual(['credit_card', 'check']);
	});

	it('terms filter drops any method codes', () => {
		const result = acceptedTermsOnly(['net_30', 'credit_card', 'cod']);
		expect(result.map((r) => r.code)).toEqual(['net_30', 'cod']);
	});

	it('methods includeCode only accepts method codes', () => {
		// Including a term code into the methods list is a cross-assignment,
		// so it should be ignored.
		const result = acceptedMethodsOnly(['credit_card'], 'net_30');
		expect(result.map((r) => r.code)).toEqual(['credit_card']);
	});

	it('terms includeCode only accepts term codes', () => {
		const result = acceptedTermsOnly(['net_30'], 'credit_card');
		expect(result.map((r) => r.code)).toEqual(['net_30']);
	});
});
