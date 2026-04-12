import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
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
