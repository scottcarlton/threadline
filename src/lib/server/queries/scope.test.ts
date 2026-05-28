import { describe, it, expect } from 'vitest';
import type { QueryScope } from './scope';

/**
 * resolveQueryScope calls supabaseAdmin and loadManagerScope, making it
 * hard to unit-test without a full Supabase mock. These tests verify the
 * QueryScope TYPE CONTRACT and discriminator narrowing instead — the actual
 * resolution logic is covered by parity tests in expenses.test.ts.
 */

function makeInternalScope(
	overrides: Partial<Extract<QueryScope, { kind: 'internal' }>> = {}
): QueryScope {
	return {
		kind: 'internal',
		userId: 'user-1',
		orgType: 'rep',
		ownOrgIds: ['org-1'],
		boaBrandIds: [],
		isSales: false,
		managerScope: null,
		...overrides
	};
}

function makeBuyerScope(
	overrides: Partial<Extract<QueryScope, { kind: 'buyer' }>> = {}
): QueryScope {
	return {
		kind: 'buyer',
		userId: 'buyer-1',
		buyerAccountIds: ['acct-1'],
		buyerBrandIds: ['brand-1'],
		...overrides
	};
}

describe('QueryScope type contract', () => {
	it('internal scope has expected fields', () => {
		const scope = makeInternalScope();
		expect(scope.kind).toBe('internal');
		if (scope.kind === 'internal') {
			expect(scope.ownOrgIds).toEqual(['org-1']);
			expect(scope.boaBrandIds).toEqual([]);
			expect(scope.isSales).toBe(false);
			expect(scope.managerScope).toBeNull();
		}
	});

	it('buyer scope has expected fields', () => {
		const scope = makeBuyerScope();
		expect(scope.kind).toBe('buyer');
		if (scope.kind === 'buyer') {
			expect(scope.buyerAccountIds).toEqual(['acct-1']);
			expect(scope.buyerBrandIds).toEqual(['brand-1']);
		}
	});

	it('nx-BLSR scope has multiple ownOrgIds', () => {
		const scope = makeInternalScope({
			ownOrgIds: ['brand-org-1', 'brand-org-2'],
			orgType: 'brand',
			isSales: true
		});
		if (scope.kind === 'internal') {
			expect(scope.ownOrgIds).toHaveLength(2);
		}
	});

	it('brand-org scope has boaBrandIds populated', () => {
		const scope = makeInternalScope({
			orgType: 'brand',
			boaBrandIds: ['brand-1', 'brand-2']
		});
		if (scope.kind === 'internal') {
			expect(scope.boaBrandIds).toEqual(['brand-1', 'brand-2']);
		}
	});
});

export { makeInternalScope, makeBuyerScope };
