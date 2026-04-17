import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { ExpenseCategory } from '$lib/types/database.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	if (!organization) return { brands: [] };

	// RLS handles federation visibility — no admin client needed for reads
	const { data: brands } = await supabase
		.from('brands')
		.select('id, name')
		.eq('is_active', true)
		.order('name');

	return { brands: brands ?? [] };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { organization, user, membership } = locals;
		if (!organization || !user) return fail(401, { message: 'Not authenticated' });

		const role = membership?.role;
		if (!role || !['admin', 'owner', 'member', 'sales'].includes(role)) {
			return fail(403, { message: 'Insufficient permissions' });
		}

		const formData = await request.formData();
		const brandId = formData.get('brand_id') as string;
		const category = formData.get('category') as ExpenseCategory;
		const description = formData.get('description') as string;
		const amount = parseFloat(formData.get('amount') as string);
		const expenseDate = formData.get('expense_date') as string;
		const notes = (formData.get('notes') as string) || null;
		const asDraft = formData.get('as_draft') === 'true';

		if (!brandId || !description || !amount || isNaN(amount)) {
			return fail(400, { message: 'Missing required fields' });
		}

		const { data: expense, error: err } = await supabaseAdmin
			.from('brand_expenses')
			.insert({
				organization_id: organization.id,
				brand_id: brandId,
				category,
				description,
				amount,
				expense_date: expenseDate,
				status: asDraft ? 'draft' : 'submitted',
				notes,
				submitted_by: user.id,
				submitted_at: asDraft ? null : new Date().toISOString()
			})
			.select('id, expense_number')
			.single();

		if (err || !expense) {
			return fail(500, { message: err?.message ?? 'Failed to create expense' });
		}

		return { success: true, expenseId: expense.id, expenseNumber: expense.expense_number, asDraft };
	}
};
