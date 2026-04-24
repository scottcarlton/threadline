import type { SupabaseClient } from '@supabase/supabase-js';

export type ManagerScope = {
	viewerProfileId: string;
	viewerMemberId: string | null;
	managedMemberIds: string[];
	managedProfileIds: string[];
	/** Viewer profile id + every profile in their management subtree. Use this for `created_by IN (...)` filters. */
	createdByScope: string[];
	/** Territory ids assigned to the viewer + any member in their managed subtree (via `member_territories`). */
	visibleTerritoryIds: string[];
	/** True when the viewer has at least one territory (directly or via rollup). Drives the fallback-to-created_by rule. */
	hasTerritoryScope: boolean;
};

/**
 * Resolve the set of members and profiles under a viewer's management subtree,
 * via `get_managed_member_ids` / `get_managed_profile_ids` (both SECURITY DEFINER).
 *
 * Returns a scope containing only the viewer when they have no membership or
 * no reports. Callers decide whether to apply a `created_by IN createdByScope`
 * union filter (e.g. Sales role) or ignore it (Admin/Owner/Member see all).
 */
export async function loadManagerScope(
	admin: SupabaseClient,
	viewerProfileId: string,
	viewerMemberId: string | null
): Promise<ManagerScope> {
	if (!viewerMemberId) {
		return {
			viewerProfileId,
			viewerMemberId: null,
			managedMemberIds: [],
			managedProfileIds: [],
			createdByScope: [viewerProfileId],
			visibleTerritoryIds: [],
			hasTerritoryScope: false
		};
	}

	const [membersRes, profilesRes] = await Promise.all([
		admin.rpc('get_managed_member_ids', { viewer_member_id: viewerMemberId }),
		admin.rpc('get_managed_profile_ids', { viewer_member_id: viewerMemberId })
	]);

	const managedMemberIds = toUuidList(membersRes.data);
	const managedProfileIds = toUuidList(profilesRes.data);

	// Territory rollup: territories assigned to the viewer OR anyone in the managed subtree.
	const memberIdScope = [viewerMemberId, ...managedMemberIds];
	const { data: territoryRows } = await admin
		.from('member_territories')
		.select('territory_id')
		.in('organization_member_id', memberIdScope);
	const visibleTerritoryIds = Array.from(
		new Set(
			(territoryRows ?? [])
				.map((r: { territory_id?: string }) => r.territory_id)
				.filter((v): v is string => typeof v === 'string')
		)
	);

	return {
		viewerProfileId,
		viewerMemberId,
		managedMemberIds,
		managedProfileIds,
		createdByScope: [viewerProfileId, ...managedProfileIds],
		visibleTerritoryIds,
		hasTerritoryScope: visibleTerritoryIds.length > 0
	};
}

// Supabase RPC can return either `string[]` or `Array<{ <fnName>: string }>`
// depending on the function shape. Normalize both into a plain uuid list.
function toUuidList(data: unknown): string[] {
	if (!Array.isArray(data)) return [];
	if (data.length === 0) return [];
	if (typeof data[0] === 'string') return data as string[];
	if (typeof data[0] === 'object' && data[0] !== null) {
		const key = Object.keys(data[0] as Record<string, unknown>)[0];
		if (!key) return [];
		return (data as Array<Record<string, unknown>>)
			.map((row) => row[key])
			.filter((v): v is string => typeof v === 'string');
	}
	return [];
}
