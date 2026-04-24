import { describe, it, expect, vi } from 'vitest';
import { loadManagerScope } from './scoping';
import type { SupabaseClient } from '@supabase/supabase-js';

type TerritoryRow = { territory_id: string };

function mockAdmin(
	members: unknown,
	profiles: unknown,
	territoryRows: TerritoryRow[] = []
): SupabaseClient {
	const rpc = vi.fn(async (name: string) => {
		if (name === 'get_managed_member_ids') return { data: members, error: null };
		if (name === 'get_managed_profile_ids') return { data: profiles, error: null };
		return { data: null, error: { message: 'unknown rpc' } };
	});

	// Chainable stub: admin.from('member_territories').select(...).in(...) → { data }
	const from = vi.fn((table: string) => {
		if (table === 'member_territories') {
			const result = { data: territoryRows, error: null };
			return {
				select: vi.fn(() => ({
					in: vi.fn(async () => result)
				}))
			};
		}
		throw new Error(`unexpected table in mock: ${table}`);
	});

	return { rpc, from } as unknown as SupabaseClient;
}

describe('loadManagerScope', () => {
	const viewerProfileId = '00000000-0000-0000-0000-00000000aaaa';
	const viewerMemberId = '00000000-0000-0000-0000-00000000bbbb';

	it('returns viewer-only scope when no viewerMemberId', async () => {
		const scope = await loadManagerScope({} as SupabaseClient, viewerProfileId, null);
		expect(scope.managedMemberIds).toEqual([]);
		expect(scope.managedProfileIds).toEqual([]);
		expect(scope.createdByScope).toEqual([viewerProfileId]);
		expect(scope.visibleTerritoryIds).toEqual([]);
		expect(scope.hasTerritoryScope).toBe(false);
	});

	it('returns empty rollup when helpers return empty arrays', async () => {
		const admin = mockAdmin([], []);
		const scope = await loadManagerScope(admin, viewerProfileId, viewerMemberId);
		expect(scope.managedMemberIds).toEqual([]);
		expect(scope.createdByScope).toEqual([viewerProfileId]);
	});

	it('flattens string[] rpc output', async () => {
		const m1 = '11111111-1111-1111-1111-111111111111';
		const p1 = '22222222-2222-2222-2222-222222222222';
		const admin = mockAdmin([m1], [p1]);
		const scope = await loadManagerScope(admin, viewerProfileId, viewerMemberId);
		expect(scope.managedMemberIds).toEqual([m1]);
		expect(scope.managedProfileIds).toEqual([p1]);
		expect(scope.createdByScope).toEqual([viewerProfileId, p1]);
	});

	it('flattens object-row rpc output', async () => {
		const m1 = '11111111-1111-1111-1111-111111111111';
		const p1 = '22222222-2222-2222-2222-222222222222';
		const admin = mockAdmin([{ get_managed_member_ids: m1 }], [{ get_managed_profile_ids: p1 }]);
		const scope = await loadManagerScope(admin, viewerProfileId, viewerMemberId);
		expect(scope.managedMemberIds).toEqual([m1]);
		expect(scope.managedProfileIds).toEqual([p1]);
	});

	it('never duplicates the viewer in createdByScope', async () => {
		const admin = mockAdmin([], []);
		const scope = await loadManagerScope(admin, viewerProfileId, viewerMemberId);
		expect(scope.createdByScope.filter((id) => id === viewerProfileId)).toHaveLength(1);
	});

	it('collects territory ids from member_territories and dedupes', async () => {
		const t1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
		const t2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
		const admin = mockAdmin(
			[],
			[],
			[{ territory_id: t1 }, { territory_id: t2 }, { territory_id: t1 }]
		);
		const scope = await loadManagerScope(admin, viewerProfileId, viewerMemberId);
		expect(scope.visibleTerritoryIds.sort()).toEqual([t1, t2].sort());
		expect(scope.hasTerritoryScope).toBe(true);
	});

	it('sets hasTerritoryScope=false when no territory assignments', async () => {
		const admin = mockAdmin([], [], []);
		const scope = await loadManagerScope(admin, viewerProfileId, viewerMemberId);
		expect(scope.visibleTerritoryIds).toEqual([]);
		expect(scope.hasTerritoryScope).toBe(false);
	});
});
