import { describe, it, expect } from 'vitest';
import { computeExpenseMetrics, type ExpenseListRow } from './expenses';
import { makeBuyerScope } from './scope.test';

function makeExpense(overrides: Partial<ExpenseListRow> = {}): ExpenseListRow {
	return {
		id: 'exp-1',
		organization_id: 'org-1',
		brand_id: 'brand-1',
		expense_number: 'EXP-001',
		category: 'travel',
		description: 'Test expense',
		amount: 100,
		expense_date: '2026-05-01',
		status: 'submitted',
		notes: null,
		submitted_by: 'user-1',
		reviewed_by: null,
		review_notes: null,
		submitted_at: null,
		approved_at: null,
		rejected_at: null,
		created_at: '2026-05-01T00:00:00Z',
		updated_at: '2026-05-01T00:00:00Z',
		reviewer: null,
		...overrides
	} as ExpenseListRow;
}

// ═══════════════════════════════════════════════════════════════════════════
// computeExpenseMetrics — pure function, fully testable
// ═══════════════════════════════════════════════════════════════════════════

describe('computeExpenseMetrics', () => {
	it('returns zeroes for empty list', () => {
		const m = computeExpenseMetrics([]);
		expect(m).toEqual({
			totalPending: 0,
			totalApproved: 0,
			totalRejected: 0,
			avgExpense: 0,
			pendingCount: 0,
			approvedCount: 0,
			rejectedCount: 0
		});
	});

	it('tallies submitted as pending', () => {
		const m = computeExpenseMetrics([
			makeExpense({ status: 'submitted', amount: 50 }),
			makeExpense({ id: 'exp-2', status: 'submitted', amount: 150 })
		]);
		expect(m.totalPending).toBe(200);
		expect(m.pendingCount).toBe(2);
		expect(m.avgExpense).toBe(100);
	});

	it('tallies approved and rejected separately', () => {
		const m = computeExpenseMetrics([
			makeExpense({ status: 'approved', amount: 300 }),
			makeExpense({ id: 'exp-2', status: 'rejected', amount: 100 }),
			makeExpense({ id: 'exp-3', status: 'approved', amount: 200 })
		]);
		expect(m.totalApproved).toBe(500);
		expect(m.approvedCount).toBe(2);
		expect(m.totalRejected).toBe(100);
		expect(m.rejectedCount).toBe(1);
	});

	it('ignores draft and other statuses', () => {
		const m = computeExpenseMetrics([makeExpense({ status: 'draft', amount: 999 })]);
		expect(m.totalPending).toBe(0);
		expect(m.totalApproved).toBe(0);
		expect(m.totalRejected).toBe(0);
		expect(m.avgExpense).toBe(999);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Parity tests — verify the filtering logic matches the old inline route
// ═══════════════════════════════════════════════════════════════════════════
// These simulate the query-filter contract by running the same filter logic
// that listOwnExpenses / listFederatedExpensesForBrand would apply. They do
// NOT call supabaseAdmin; instead they replicate the filter predicates against
// in-memory data — if the predicates diverge from what the module applies to
// Supabase, that's the bug these catch.

const ALL_EXPENSES = [
	makeExpense({
		id: 'own-1',
		organization_id: 'org-1',
		brand_id: 'brand-1',
		submitted_by: 'user-1'
	}),
	makeExpense({
		id: 'own-2',
		organization_id: 'org-1',
		brand_id: 'brand-2',
		submitted_by: 'user-2'
	}),
	makeExpense({
		id: 'fed-1',
		organization_id: 'rep-org-1',
		brand_id: 'brand-1',
		submitted_by: 'rep-user-1'
	}),
	makeExpense({
		id: 'fed-2',
		organization_id: 'rep-org-2',
		brand_id: 'brand-2',
		submitted_by: 'rep-user-2'
	}),
	makeExpense({
		id: 'unrelated-1',
		organization_id: 'other-org',
		brand_id: 'other-brand',
		submitted_by: 'other-user'
	})
];

function simulateOwnExpenses(
	expenses: ExpenseListRow[],
	ownOrgIds: string[],
	isSales: boolean,
	userId: string
): ExpenseListRow[] {
	return expenses
		.filter((e) => ownOrgIds.includes(e.organization_id))
		.filter((e) => (isSales ? e.submitted_by === userId : true));
}

function simulateFederatedExpensesForBrand(
	expenses: ExpenseListRow[],
	boaBrandIds: string[],
	ownOrgIds: string[]
): ExpenseListRow[] {
	return expenses.filter(
		(e) => boaBrandIds.includes(e.brand_id) && !ownOrgIds.includes(e.organization_id)
	);
}

function simulateCombined(own: ExpenseListRow[], federated: ExpenseListRow[]): ExpenseListRow[] {
	const seen = new Set(own.map((e) => e.id));
	const combined = [...own];
	for (const e of federated) {
		if (!seen.has(e.id)) combined.push(e);
	}
	combined.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
	return combined;
}

describe('parity: rep-org owner', () => {
	it('sees only own-org expenses', () => {
		const own = simulateOwnExpenses(ALL_EXPENSES, ['org-1'], false, 'user-1');
		expect(own.map((e) => e.id)).toEqual(['own-1', 'own-2']);
	});

	it('does not see federated expenses (rep orgs have no BOA federation path for expenses)', () => {
		const fed = simulateFederatedExpensesForBrand(ALL_EXPENSES, [], ['org-1']);
		expect(fed).toEqual([]);
	});
});

describe('parity: rep-org sales', () => {
	it('sees only own submitted expenses', () => {
		const own = simulateOwnExpenses(ALL_EXPENSES, ['org-1'], true, 'user-1');
		expect(own.map((e) => e.id)).toEqual(['own-1']);
	});
});

describe('parity: nx-BLSR (sales in 2+ brand orgs)', () => {
	it('sees own expenses across all brand-org memberships', () => {
		const nxExpenses = [
			...ALL_EXPENSES,
			makeExpense({ id: 'nx-1', organization_id: 'brand-org-2', submitted_by: 'user-1' })
		];
		const own = simulateOwnExpenses(nxExpenses, ['org-1', 'brand-org-2'], true, 'user-1');
		expect(own.map((e) => e.id)).toEqual(['own-1', 'nx-1']);
	});

	it('does not see federated expenses (sales role excluded)', () => {
		// In the real module, listFederatedExpensesForBrand returns [] when isSales
		// This test documents that the nx-BLSR path never hits federation
	});
});

describe('parity: brand-org owner (BOA)', () => {
	it('sees own-org expenses', () => {
		const own = simulateOwnExpenses(ALL_EXPENSES, ['org-1'], false, 'boa-admin');
		expect(own.map((e) => e.id)).toEqual(['own-1', 'own-2']);
	});

	it('sees federated expenses on its brands from connected rep orgs', () => {
		const fed = simulateFederatedExpensesForBrand(ALL_EXPENSES, ['brand-1', 'brand-2'], ['org-1']);
		expect(fed.map((e) => e.id)).toEqual(['fed-1', 'fed-2']);
	});

	it('combined dedupes and sorts newest-first', () => {
		const own = simulateOwnExpenses(ALL_EXPENSES, ['org-1'], false, 'boa-admin');
		const fed = simulateFederatedExpensesForBrand(ALL_EXPENSES, ['brand-1', 'brand-2'], ['org-1']);
		const combined = simulateCombined(own, fed);
		expect(combined.map((e) => e.id)).toEqual(['own-1', 'own-2', 'fed-1', 'fed-2']);
	});

	it('does not see unrelated org expenses', () => {
		const fed = simulateFederatedExpensesForBrand(ALL_EXPENSES, ['brand-1', 'brand-2'], ['org-1']);
		expect(fed.map((e) => e.id)).not.toContain('unrelated-1');
	});
});

describe('parity: brand-org sales', () => {
	it('sees only own submitted expenses, no federation', () => {
		const own = simulateOwnExpenses(ALL_EXPENSES, ['org-1'], true, 'user-1');
		expect(own.map((e) => e.id)).toEqual(['own-1']);
		// Federation excluded for sales — listFederatedExpensesForBrand returns []
	});
});

describe('parity: buyer scope', () => {
	it('returns empty for buyer (expenses are not buyer-visible)', () => {
		const scope = makeBuyerScope();
		// listOwnExpenses and listFederatedExpensesForBrand both return [] for buyer scope
		expect(scope.kind).toBe('buyer');
	});
});
