import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

/**
 * Every account on the platform.
 *
 * Emails live in `auth.users`, which PostgREST does not expose, so the listing
 * comes from the admin auth API rather than a query. That caps the page at
 * PER_PAGE accounts and makes search server-side-over-a-fetched-page; at beta
 * scale that is fine. If the user count outgrows it, the replacement is a
 * service-role-only view over auth.users, not a bigger page size.
 */
const PER_PAGE = 1000;

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';

	const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
		page: 1,
		perPage: PER_PAGE
	});
	if (authError) throw authError;

	const authUsers = authData.users;
	const ids = authUsers.map((u) => u.id);

	const [profilesResult, membershipsResult] = await Promise.all([
		supabaseAdmin.from('profiles').select('id, display_name').in('id', ids),
		supabaseAdmin
			.from('organization_members')
			.select('profile_id, role, organizations(name)')
			.in('profile_id', ids)
	]);

	const nameById = new Map(
		((profilesResult.data ?? []) as { id: string; display_name: string }[]).map((p) => [
			p.id,
			p.display_name
		])
	);

	type MembershipRow = {
		profile_id: string;
		role: string;
		organizations: { name?: string } | { name?: string }[] | null;
	};
	const orgsById = new Map<string, string[]>();
	for (const m of (membershipsResult.data ?? []) as MembershipRow[]) {
		const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
		if (!org?.name) continue;
		const list = orgsById.get(m.profile_id) ?? [];
		list.push(`${org.name} (${m.role})`);
		orgsById.set(m.profile_id, list);
	}

	const users = authUsers
		.map((u) => ({
			id: u.id,
			email: u.email ?? null,
			displayName: nameById.get(u.id) ?? null,
			organizations: orgsById.get(u.id) ?? [],
			createdAt: u.created_at,
			lastSignInAt: u.last_sign_in_at ?? null
		}))
		.filter((u) => {
			if (!q) return true;
			return (
				(u.email ?? '').toLowerCase().includes(q) || (u.displayName ?? '').toLowerCase().includes(q)
			);
		})
		.sort((a, b) => (b.lastSignInAt ?? '').localeCompare(a.lastSignInAt ?? ''));

	return { users, q, truncated: authUsers.length >= PER_PAGE };
};
