import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	// Root layout load only reads from `locals` — without a dependency, SvelteKit
	// reuses its cached output across client-side navigations and the navbar ends
	// up stuck on whatever user/org state was set when this first ran (notably
	// null on public routes like /connect/[code]). Invalidate via `app:auth`.
	depends('app:auth');

	let agents: { id: string; name: string; slug: string; description: string | null }[] = [];

	if (locals.organization && locals.session) {
		const { data } = await locals.supabase
			.from('org_agents')
			.select('id, name, slug, description')
			.eq('organization_id', locals.organization.id)
			.eq('is_active', true)
			.order('name');
		agents = data ?? [];
	}

	return {
		session: locals.session,
		user: locals.user,
		membership: locals.membership,
		organization: locals.organization,
		orgType: locals.orgType,
		allMemberships: locals.allMemberships,
		brandScope: locals.brandScope,
		scopedBrandNames: locals.scopedBrandNames,
		isBuyer: locals.isBuyer,
		buyerAccounts: locals.buyerAccounts,
		buyerBrandIds: locals.buyerBrandIds,
		agents
	};
};
