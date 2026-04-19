import { describe, it, expect } from 'vitest';
import { decideOutcome } from './outcome.js';
import type { ResolvedOrder, ResolvedLine } from './resolve.js';

function makeResolved(
	overrides: Partial<ResolvedOrder & { kind: 'resolved' }> = {},
	lineOverrides: Partial<ResolvedLine>[] = []
): ResolvedOrder & { kind: 'resolved' } {
	const defaultLine: ResolvedLine = {
		lineIndex: 0,
		rawText: 'Test Product: 2 S, 3 M',
		matchedProductId: 'prod-1',
		matchedProductName: 'Test Product',
		confidence: 0.95,
		variants: [
			{ size: 'S', qty: 2, variantId: 'var-1', unitPrice: 50 },
			{ size: 'M', qty: 3, variantId: 'var-2', unitPrice: 50 }
		],
		issues: []
	};

	const lines =
		lineOverrides.length > 0
			? lineOverrides.map((lo, i) => ({ ...defaultLine, lineIndex: i, ...lo }))
			: [defaultLine];

	return {
		kind: 'resolved',
		organizationId: 'org-1',
		userId: 'user-1',
		accountId: 'acct-1',
		accountName: 'Bloom Boutique',
		accountConfidence: 0.9,
		brandId: 'brand-1',
		brandName: 'Monarch Haze',
		startShipDate: '2026-05-20',
		expectedShipDate: '2026-06-20',
		lines,
		notes: null,
		...overrides
	};
}

describe('decideOutcome', () => {
	it('auto-submits when everything is clean', () => {
		const result = decideOutcome(makeResolved());
		expect(result.status).toBe('submitted');
		expect(result.reasons).toHaveLength(0);
	});

	it('flags for review when account is missing', () => {
		const result = decideOutcome(makeResolved({ accountId: null }));
		expect(result.status).toBe('needs_review');
		expect(result.reasons.some((r) => r.reason.includes('Account'))).toBe(true);
	});

	it('flags for review when account confidence is too low', () => {
		const result = decideOutcome(makeResolved({ accountConfidence: 0.4 }));
		expect(result.status).toBe('needs_review');
		expect(result.reasons.some((r) => r.reason.includes('confidence'))).toBe(true);
	});

	it('flags for review when brand is missing', () => {
		const result = decideOutcome(makeResolved({ brandId: null }));
		expect(result.status).toBe('needs_review');
		expect(result.reasons.some((r) => r.reason.includes('Brand'))).toBe(true);
	});

	it('flags for review when a line has issues', () => {
		const result = decideOutcome(
			makeResolved({}, [
				{
					issues: [{ code: 'low_confidence', detail: 'Best match has low confidence' }]
				}
			])
		);
		expect(result.status).toBe('needs_review');
		expect(result.reasons).toHaveLength(1);
	});

	it('flags for review when a variant is unresolved', () => {
		const result = decideOutcome(
			makeResolved({}, [
				{
					variants: [{ size: 'XXS', qty: 1, variantId: null, unitPrice: 0 }]
				}
			])
		);
		expect(result.status).toBe('needs_review');
		expect(result.reasons.some((r) => r.reason.includes('variant'))).toBe(true);
	});

	it('flags for review when qty is out of range', () => {
		const result = decideOutcome(
			makeResolved({}, [
				{
					variants: [{ size: 'M', qty: 0, variantId: 'var-1', unitPrice: 50 }]
				}
			])
		);
		expect(result.status).toBe('needs_review');
		expect(result.reasons.some((r) => r.reason.includes('Quantity'))).toBe(true);
	});

	it('flags for review when qty exceeds 999', () => {
		const result = decideOutcome(
			makeResolved({}, [
				{
					variants: [{ size: 'M', qty: 1000, variantId: 'var-1', unitPrice: 50 }]
				}
			])
		);
		expect(result.status).toBe('needs_review');
		expect(result.reasons.some((r) => r.reason.includes('Quantity'))).toBe(true);
	});

	it('accumulates multiple reasons', () => {
		const result = decideOutcome(
			makeResolved({ accountId: null, brandId: null }, [
				{
					issues: [{ code: 'no_match', detail: 'Product not found' }],
					variants: [{ size: 'XXL', qty: 1, variantId: null, unitPrice: 0 }]
				}
			])
		);
		expect(result.status).toBe('needs_review');
		// account + brand + issue + variant = 4 reasons
		expect(result.reasons.length).toBeGreaterThanOrEqual(4);
	});
});
