import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params }) => {
	const { data: uploadToken } = await supabaseAdmin
		.from('expense_upload_tokens')
		.select('*, brand_expenses(expense_number, description), organizations(name)')
		.eq('token', params.token)
		.single();

	if (!uploadToken) {
		throw error(404, 'Upload link not found');
	}

	if (new Date(uploadToken.expires_at) < new Date()) {
		throw error(410, 'This upload link has expired');
	}

	return {
		token: uploadToken.token,
		expiresAt: uploadToken.expires_at,
		expenseNumber: uploadToken.brand_expenses?.expense_number ?? 'Expense',
		expenseDescription: uploadToken.brand_expenses?.description ?? '',
		orgName: uploadToken.organizations?.name ?? ''
	};
};
