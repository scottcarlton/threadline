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

	// Who can approve / reject a brand expense:
	//   - Admin/owner of the owning org (scope = the whole org, incl. all brands)
	//   - Scoped member or guest whose brandScope includes this expense's brand
	// Sales role is excluded — submitters, not reviewers.
	const role = locals.membership?.role;
	const ownsOrg =
		locals.organization?.id === expenseResult.data.organization_id &&
		(role === 'admin' || role === 'owner');
	const scopedToBrand =
		locals.brandScope !== null &&
		locals.brandScope.includes(expenseResult.data.brand_id) &&
		(role === 'member' || role === 'guest');
	const isBrandReviewer = ownsOrg || scopedToBrand;

	return {
		expense: expenseResult.data,
		receipts: receiptsResult.data ?? [],
		reviewerName,
		isBrandReviewer
	};
};
