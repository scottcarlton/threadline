import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase } = locals;

	const [expenseResult, receiptsResult] = await Promise.all([
		supabase
			.from('brand_expenses')
			.select('*, brands(name), profiles!brand_expenses_submitted_by_fkey(display_name)')
			.eq('id', params.id)
			.single(),
		supabase
			.from('expense_receipts')
			.select('*')
			.eq('expense_id', params.id)
			.order('created_at', { ascending: false })
	]);

	if (expenseResult.error || !expenseResult.data) {
		throw error(404, 'Expense not found');
	}

	// Load reviewer info if reviewed
	let reviewerName: string | null = null;
	if (expenseResult.data.reviewed_by) {
		const { data: reviewer } = await supabase
			.from('profiles')
			.select('display_name')
			.eq('id', expenseResult.data.reviewed_by)
			.single();
		reviewerName = reviewer?.display_name ?? null;
	}

	// Check if user is a brand member scoped to this expense's brand
	const isBrandReviewer =
		locals.brandScope !== null &&
		locals.brandScope.includes(expenseResult.data.brand_id) &&
		(locals.membership?.role === 'member' || locals.membership?.role === 'sales');

	return {
		expense: expenseResult.data,
		receipts: receiptsResult.data ?? [],
		reviewerName,
		isBrandReviewer
	};
};
