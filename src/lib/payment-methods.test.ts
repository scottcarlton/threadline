import { describe, expect, it } from 'vitest';
import {
	PAYMENT_METHODS,
	acceptedPaymentMethods,
	isPaymentMethodCode,
	paymentMethodLabel
} from './payment-methods';

describe('payment-methods', () => {
	it('exports a non-empty canonical list with unique codes', () => {
		expect(PAYMENT_METHODS.length).toBeGreaterThan(0);
		const codes = PAYMENT_METHODS.map((m) => m.code);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('labels known codes and falls back to the code for unknown ones', () => {
		expect(paymentMethodLabel('net_30')).toBe('Net 30');
		expect(paymentMethodLabel('mystery')).toBe('mystery');
		expect(paymentMethodLabel(null)).toBe('Not set');
		expect(paymentMethodLabel(undefined)).toBe('Not set');
		expect(paymentMethodLabel('')).toBe('Not set');
	});

	it('validates codes', () => {
		expect(isPaymentMethodCode('net_30')).toBe(true);
		expect(isPaymentMethodCode('bogus')).toBe(false);
		expect(isPaymentMethodCode(null)).toBe(false);
		expect(isPaymentMethodCode(42)).toBe(false);
	});

	it('returns accepted methods in canonical order', () => {
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
