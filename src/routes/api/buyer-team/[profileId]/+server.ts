import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !locals.isBuyer) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (params.profileId === locals.user.id) {
		return json({ error: 'You cannot remove yourself.' }, { status: 400 });
	}

	const { data: adminAccounts } = await supabaseAdmin
		.from('account_users')
		.select('account_id')
		.eq('profile_id', locals.user.id)
		.eq('role', 'buyer_admin');

	const adminAccountIds = (adminAccounts ?? []).map((r) => r.account_id);
	if (adminAccountIds.length === 0) {
		return json({ error: 'You must be a buyer admin to remove teammates.' }, { status: 403 });
	}

	const { error } = await supabaseAdmin
		.from('account_users')
		.delete()
		.eq('profile_id', params.profileId)
		.in('account_id', adminAccountIds);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
