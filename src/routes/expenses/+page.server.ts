import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { listAllVisibleExpenses, computeExpenseMetrics } from '$lib/server/queries/expenses.js';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('data:expenses');

	const emptyReturn = {
		expenses: [],
		brands: [],
		metrics: {
			totalPending: 0,
			totalApproved: 0,
			totalRejected: 0,
			avgExpense: 0,
			pendingCount: 0,
			approvedCount: 0,
			rejectedCount: 0
		}
	};

	const scope = locals.queryScope;
	if (!scope) return emptyReturn;

	const status = url.searchParams.get('status');
	const brandId = url.searchParams.get('brand');
	const category = url.searchParams.get('category');

	const expenses = await listAllVisibleExpenses(scope, { status, brandId, category });

	const { data: brands } = await supabaseAdmin
		.from('brands')
		.select('id, name')
		.eq('is_active', true)
		.order('name');

	return {
		expenses,
		brands: brands ?? [],
		metrics: computeExpenseMetrics(expenses)
	};
};
