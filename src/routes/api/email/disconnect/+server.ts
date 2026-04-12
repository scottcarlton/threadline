import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await supabaseAdmin
		.from('email_connections')
		.delete()
		.eq('profile_id', locals.user.id)
		.eq('provider', 'gmail');

	return json({ success: true });
};
