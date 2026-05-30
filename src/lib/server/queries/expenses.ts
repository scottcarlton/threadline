import { supabaseAdmin } from '../supabase';
import type { QueryScope } from './scope';
import type { BrandExpense } from '$lib/types/database';

export type ExpenseFilters = {
	status?: string | null;
	brandId?: string | null;
	category?: string | null;
};

export type ExpenseListRow = BrandExpense & {
	reviewer: { display_name: string | null } | null;
};

const EXPENSE_SELECT =
	'*, brands(name), profiles!brand_expenses_submitted_by_fkey(display_name), reviewer:profiles!brand_expenses_reviewed_by_fkey(display_name)';

function applyFilters(
	query: ReturnType<ReturnType<typeof supabaseAdmin.from>['select']>,
	filters: ExpenseFilters
) {
	let q = query;
	if (filters.status) q = q.eq('status', filters.status);
	if (filters.brandId) q = q.eq('brand_id', filters.brandId);
	if (filters.category) q = q.eq('category', filters.category);
	return q;
}

/**
 * Own-org expenses. Sales role sees only their own submissions.
 * Nx-BLSR sees expenses across the union of their brand-org memberships.
 */
export async function listOwnExpenses(
	scope: QueryScope,
	filters: ExpenseFilters
): Promise<ExpenseListRow[]> {
	if (scope.kind !== 'internal') return [];

	let query = supabaseAdmin
		.from('brand_expenses')
		.select(EXPENSE_SELECT)
		.in('organization_id', scope.ownOrgIds)
		.order('created_at', { ascending: false });

	if (scope.isSales) query = query.eq('submitted_by', scope.userId);
	query = applyFilters(query, filters);

	const { data } = await query;
	return (data ?? []) as unknown as ExpenseListRow[];
}

/**
 * BOA federation: brand-org sees expenses from connected rep orgs on its brands.
 * Excluded for sales role (Nx-BLSR is sales and already sees their own expenses
 * across all their brand-org memberships via listOwnExpenses).
 *
 * Uses scope.boaBrandIds (resolved once in resolveQueryScope) and excludes
 * own-org rows to avoid duplication with listOwnExpenses.
 */
export async function listFederatedExpensesForBrand(
	scope: QueryScope,
	filters: ExpenseFilters
): Promise<ExpenseListRow[]> {
	if (scope.kind !== 'internal') return [];
	if (scope.orgType !== 'brand') return [];
	if (scope.isSales) return [];
	if (scope.boaBrandIds.length === 0) return [];

	let query = supabaseAdmin
		.from('brand_expenses')
		.select(EXPENSE_SELECT)
		.in('brand_id', scope.boaBrandIds)
		.not('organization_id', 'in', `(${scope.ownOrgIds.join(',')})`)
		.order('created_at', { ascending: false });

	query = applyFilters(query, filters);

	const { data } = await query;
	return (data ?? []) as unknown as ExpenseListRow[];
}

/**
 * Combined own + federated expenses, deduped and sorted newest-first.
 * Mirrors the existing route logic exactly.
 */
export async function listAllVisibleExpenses(
	scope: QueryScope,
	filters: ExpenseFilters
): Promise<ExpenseListRow[]> {
	const own = await listOwnExpenses(scope, filters);

	const federated = await listFederatedExpensesForBrand(scope, filters);
	if (federated.length === 0) return own;

	const seen = new Set(own.map((e) => e.id));
	for (const e of federated) {
		if (!seen.has(e.id)) own.push(e);
	}
	own.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
	return own;
}

export type ExpenseMetrics = {
	totalPending: number;
	totalApproved: number;
	totalRejected: number;
	avgExpense: number;
	pendingCount: number;
	approvedCount: number;
	rejectedCount: number;
};

export function computeExpenseMetrics(expenses: ExpenseListRow[]): ExpenseMetrics {
	let totalPending = 0;
	let totalApproved = 0;
	let totalRejected = 0;
	let pendingCount = 0;
	let approvedCount = 0;
	let rejectedCount = 0;

	for (const e of expenses) {
		const amount = Number(e.amount) || 0;
		if (e.status === 'submitted') {
			totalPending += amount;
			pendingCount++;
		} else if (e.status === 'approved') {
			totalApproved += amount;
			approvedCount++;
		} else if (e.status === 'rejected') {
			totalRejected += amount;
			rejectedCount++;
		}
	}

	return {
		totalPending,
		totalApproved,
		totalRejected,
		avgExpense:
			expenses.length > 0
				? expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) / expenses.length
				: 0,
		pendingCount,
		approvedCount,
		rejectedCount
	};
}
