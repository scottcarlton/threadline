import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { ExpenseCategory } from '$lib/types/database.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.organization || !locals.user) throw error(401, 'Not authenticated');

	const [expenseResult, receiptsResult] = await Promise.all([
		supabaseAdmin
			.from('brand_expenses')
			.select('*, brands(name), profiles!brand_expenses_submitted_by_fkey(display_name)')
			.eq('id', params.id)
			.single(),
		supabaseAdmin
			.from('expense_receipts')
			.select('*')
			.eq('expense_id', params.id)
			.order('created_at', { ascending: false })
	]);

	if (expenseResult.error || !expenseResult.data) {
		throw error(404, 'Expense not found');
	}

	// App-layer access check: user must be in the expense's org OR connected to it
	const expense = expenseResult.data;
	const isOwnOrg = locals.organization.id === expense.organization_id;

	if (!isOwnOrg) {
		// Check if user's org is connected (BOA seeing rep expense on their brand)
		const { data: conn } = await supabaseAdmin
			.from('org_connections')
			.select('id')
			.eq('status', 'active')
			.or(
				`and(rep_org_id.eq.${expense.organization_id},brand_org_id.eq.${locals.organization.id}),and(rep_org_id.eq.${locals.organization.id},brand_org_id.eq.${expense.organization_id})`
			)
			.limit(1)
			.single();

		if (!conn) throw error(404, 'Expense not found');
	}

	// Load reviewer info if reviewed
	let reviewerName: string | null = null;
	if (expense.reviewed_by) {
		const { data: reviewer } = await supabaseAdmin
			.from('profiles')
			.select('display_name')
			.eq('id', expense.reviewed_by)
			.single();
		reviewerName = reviewer?.display_name ?? null;
	}

	// Who can approve / reject a brand expense:
	//   - BOA admin/owner viewing a connected rep's expense on their brand
	//   - MBISR member scoped to the expense's brand (own-org only)
	//   - MBISR admin/owner CANNOT approve (they submit, not review)
	const role = locals.membership?.role;
	const isBoaReviewer =
		!isOwnOrg && locals.orgType === 'brand' && (role === 'admin' || role === 'owner');
	const isScopedMember =
		isOwnOrg &&
		role === 'member' &&
		locals.brandScope !== null &&
		locals.brandScope.includes(expense.brand_id);
	const isBrandReviewer = isBoaReviewer || isScopedMember;

	return {
		expense,
		receipts: receiptsResult.data ?? [],
		reviewerName,
		isBrandReviewer
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		if (!locals.organization || !locals.user) return fail(401, { message: 'Not authenticated' });

		const fd = await request.formData();
		const { error: err } = await supabaseAdmin
			.from('brand_expenses')
			.update({
				category: fd.get('category') as ExpenseCategory,
				description: fd.get('description') as string,
				amount: parseFloat(fd.get('amount') as string),
				expense_date: fd.get('expense_date') as string,
				notes: (fd.get('notes') as string) || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id);

		if (err) return fail(500, { message: err.message });
		return { success: true };
	},

	submit: async ({ locals, params }) => {
		if (!locals.organization || !locals.user) return fail(401, { message: 'Not authenticated' });

		const { error: err } = await supabaseAdmin
			.from('brand_expenses')
			.update({
				status: 'submitted',
				submitted_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id);

		if (err) return fail(500, { message: err.message });
		return { success: true };
	},

	approve: async ({ locals, params }) => {
		if (!locals.organization || !locals.user) return fail(401, { message: 'Not authenticated' });

		// Fetch expense to check authorization
		const { data: expense } = await supabaseAdmin
			.from('brand_expenses')
			.select('organization_id, brand_id')
			.eq('id', params.id)
			.single();
		if (!expense) return fail(404, { message: 'Expense not found' });

		const role = locals.membership?.role;
		const isOwnOrg = locals.organization.id === expense.organization_id;
		const isBoaReviewer =
			!isOwnOrg && locals.orgType === 'brand' && (role === 'admin' || role === 'owner');
		const isScopedMember =
			isOwnOrg &&
			role === 'member' &&
			locals.brandScope !== null &&
			locals.brandScope.includes(expense.brand_id);
		if (!isBoaReviewer && !isScopedMember)
			return fail(403, { message: 'Not authorized to approve' });

		const { error: err } = await supabaseAdmin
			.from('brand_expenses')
			.update({
				status: 'approved',
				reviewed_by: locals.user.id,
				approved_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id);

		if (err) return fail(500, { message: err.message });
		return { success: true };
	},

	reject: async ({ request, locals, params }) => {
		if (!locals.organization || !locals.user) return fail(401, { message: 'Not authenticated' });

		// Fetch expense to check authorization
		const { data: expense } = await supabaseAdmin
			.from('brand_expenses')
			.select('organization_id, brand_id')
			.eq('id', params.id)
			.single();
		if (!expense) return fail(404, { message: 'Expense not found' });

		const role = locals.membership?.role;
		const isOwnOrg = locals.organization.id === expense.organization_id;
		const isBoaReviewer =
			!isOwnOrg && locals.orgType === 'brand' && (role === 'admin' || role === 'owner');
		const isScopedMember =
			isOwnOrg &&
			role === 'member' &&
			locals.brandScope !== null &&
			locals.brandScope.includes(expense.brand_id);
		if (!isBoaReviewer && !isScopedMember)
			return fail(403, { message: 'Not authorized to reject' });

		const fd = await request.formData();
		const { error: err } = await supabaseAdmin
			.from('brand_expenses')
			.update({
				status: 'rejected',
				reviewed_by: locals.user.id,
				review_notes: (fd.get('review_notes') as string) || null,
				rejected_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id);

		if (err) return fail(500, { message: err.message });
		return { success: true };
	},

	delete: async ({ locals, params }) => {
		if (!locals.organization || !locals.user) return fail(401, { message: 'Not authenticated' });

		const { error: err } = await supabaseAdmin.from('brand_expenses').delete().eq('id', params.id);

		if (err) return fail(500, { message: err.message });
		return { success: true, deleted: true };
	}
};
