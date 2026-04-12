import { redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.isBuyer) throw redirect(303, '/insight');

	const { organization } = locals;
	if (!organization) throw redirect(303, '/dashboard');

	const accountId = locals.buyerAccounts?.[0]?.account_id;
	if (!accountId) throw redirect(303, '/dashboard');

	const { data: deliveries } = await supabaseAdmin
		.from('season_deliveries')
		.select('*, seasons(name)')
		.eq('organization_id', organization.id)
		.order('sort_order');

	return {
		deliveries: deliveries ?? [],
		accountId,
		organizationId: organization.id,
		userId: locals.user?.id
	};
};
