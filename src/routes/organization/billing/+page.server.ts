import type { PageServerLoad } from './$types';
import { plansForOrgType } from '$lib/billing/plans.js';
import { isCheckoutOpen } from '$lib/server/beta.js';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const data = await parent();

	// RLS limits this to admin/owner, which the /organization layout already
	// requires. No row means the org is on beta.
	const { data: subscription } = await locals.supabase
		.from('organization_subscriptions')
		.select('plan, status, current_period_end, cancel_at_period_end')
		.eq('organization_id', locals.organization!.id)
		.maybeSingle();

	return {
		...data,
		plans: plansForOrgType(locals.orgType),
		checkoutOpen: isCheckoutOpen(),
		subscription: subscription as {
			plan: string | null;
			status: string | null;
			current_period_end: string | null;
			cancel_at_period_end: boolean;
		} | null
	};
};
