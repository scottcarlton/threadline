import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return { territories: [], members: [] };

	const [territoriesRes, membersRes, accountCountsRes] = await Promise.all([
		supabase
			.from('territories')
			.select('*, organization_members(profiles!organization_members_profile_id_fkey(display_name))')
			.eq('organization_id', organization.id)
			.order('name'),
		supabase
			.from('organization_members')
			.select('id, profiles!organization_members_profile_id_fkey(display_name)')
			.eq('organization_id', organization.id),
		supabase
			.from('accounts')
			.select('territory_id')
			.eq('organization_id', organization.id)
			.not('territory_id', 'is', null)
	]);

	// Count accounts per territory
	const accountCounts: Record<string, number> = {};
	for (const a of accountCountsRes.data ?? []) {
		if (a.territory_id) {
			accountCounts[a.territory_id] = (accountCounts[a.territory_id] ?? 0) + 1;
		}
	}

	return {
		territories: territoriesRes.data ?? [],
		members: membersRes.data ?? [],
		accountCounts
	};
};
