import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('data:territories');
	const { supabase, organization } = locals;
	if (!organization) return { territories: [], members: [] };

	// Territories list shows own-org territories + (for rep orgs) connected-brand
	// territories the viewer can read via federation SELECT. RLS does the filtering.
	const [territoriesRes, membersRes, accountCountsRes, assigneeJoinRes, brandsRes] =
		await Promise.all([
			supabase
				.from('territories')
				.select('id, name, notes, organization_id, brand_id, created_at, updated_at')
				.order('name'),
			supabase
				.from('organization_members')
				.select('id, profiles!organization_members_profile_id_fkey(display_name)')
				.eq('organization_id', organization.id),
			supabase
				.from('accounts')
				.select('territory_id')
				.eq('organization_id', organization.id)
				.not('territory_id', 'is', null),
			supabase
				.from('member_territories')
				.select(
					'territory_id, organization_member_id, organization_members!inner(organization_id, profiles!organization_members_profile_id_fkey(display_name))'
				)
				.eq('organization_members.organization_id', organization.id),
			// Union of own brands + connected-brand orgs' brands for labeling.
			supabase.from('brands').select('id, name').eq('is_active', true).order('name')
		]);

	// Count accounts per territory
	const accountCounts: Record<string, number> = {};
	for (const a of accountCountsRes.data ?? []) {
		if (a.territory_id) {
			accountCounts[a.territory_id] = (accountCounts[a.territory_id] ?? 0) + 1;
		}
	}

	// Map each territory → [{ id, name }, ...]
	type AssigneeJoinRow = {
		territory_id: string;
		organization_member_id: string;
		organization_members?:
			| { profiles?: { display_name?: string } | { display_name?: string }[] | null }
			| { profiles?: { display_name?: string } | { display_name?: string }[] | null }[]
			| null;
	};
	const territoryAssignees: Record<string, Array<{ id: string; name: string }>> = {};
	for (const row of (assigneeJoinRes.data ?? []) as AssigneeJoinRow[]) {
		const om = Array.isArray(row.organization_members)
			? row.organization_members[0]
			: row.organization_members;
		const profile = Array.isArray(om?.profiles) ? om?.profiles[0] : om?.profiles;
		const name = profile?.display_name ?? 'Unknown';
		(territoryAssignees[row.territory_id] ??= []).push({ id: row.organization_member_id, name });
	}

	const brandNameById: Record<string, string> = {};
	for (const b of brandsRes.data ?? []) brandNameById[b.id] = b.name;

	return {
		territories: territoriesRes.data ?? [],
		members: membersRes.data ?? [],
		accountCounts,
		territoryAssignees,
		brandNameById,
		ownOrgId: organization.id
	};
};
