import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const expenseId = params.id;
	const orgId = locals.organization.id;

	// Verify expense exists and belongs to this org
	const { data: expense } = await supabaseAdmin
		.from('brand_expenses')
		.select('id')
		.eq('id', expenseId)
		.eq('organization_id', orgId)
		.single();

	if (!expense) {
		return json({ error: 'Expense not found' }, { status: 404 });
	}

	const token = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

	const { error: insertError } = await supabaseAdmin
		.from('expense_upload_tokens')
		.insert({
			expense_id: expenseId,
			organization_id: orgId,
			token,
			created_by: locals.user.id,
			expires_at: expiresAt
		});

	if (insertError) {
		return json({ error: insertError.message }, { status: 500 });
	}

	const uploadUrl = `${url.origin}/upload/${token}`;

	return json({ token, url: uploadUrl, expiresAt });
};
