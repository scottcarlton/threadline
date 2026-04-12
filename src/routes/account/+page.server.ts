import { redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.isBuyer) throw redirect(303, '/insight');

	const accountId = locals.buyerAccounts?.[0]?.account_id;
	if (!accountId) throw redirect(303, '/dashboard');

	const { data: account } = await supabaseAdmin
		.from('accounts')
		.select('id, business_name, contact_first_name, contact_last_name, contact_email, phone, address_line1, address_line2, city, state, zip, country')
		.eq('id', accountId)
		.single();

	return { account: account ?? null };
};
