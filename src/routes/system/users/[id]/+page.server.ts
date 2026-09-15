import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { fetchActivity, describeAuditRow } from '$lib/server/audit/query.js';
import { isSystemAdminEmail } from '$lib/server/system-admin.js';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(
		params.id
	);
	if (authError || !authUser?.user) throw error(404, 'User not found');
	const user = authUser.user;

	const statusFilter = url.searchParams.get('status') === 'failure' ? 'failure' : undefined;

	// The one place system-admin rows stay visible. Everywhere else in the
	// console they are noise; on a system admin's own record they are the point.
	const viewingSystemAdmin = isSystemAdminEmail(user.email);

	const [profileResult, membershipsResult, activity] = await Promise.all([
		supabaseAdmin.from('profiles').select('display_name, phone').eq('id', user.id).maybeSingle(),
		supabaseAdmin
			.from('organization_members')
			.select('id, role, created_at, organization_id, organizations(name)')
			.eq('profile_id', user.id),
		fetchActivity({
			actorId: user.id,
			status: statusFilter,
			limit: 100,
			excludeSystemActors: !viewingSystemAdmin
		})
	]);

	type MembershipRow = {
		id: string;
		role: string;
		created_at: string;
		organization_id: string;
		organizations: { name?: string } | { name?: string }[] | null;
	};

	const memberships = ((membershipsResult.data ?? []) as MembershipRow[]).map((m) => {
		const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
		return {
			id: m.id,
			organizationId: m.organization_id,
			organizationName: org?.name ?? 'Unknown organization',
			role: m.role,
			joinedAt: m.created_at
		};
	});

	locals.audit.record('system.user_viewed', {
		subjectId: user.id,
		subjectLabel: profileResult.data?.display_name ?? user.email ?? user.id
	});

	return {
		profile: {
			id: user.id,
			email: user.email ?? null,
			displayName: profileResult.data?.display_name ?? null,
			createdAt: user.created_at,
			lastSignInAt: user.last_sign_in_at ?? null
		},
		memberships,
		isSystemAdmin: viewingSystemAdmin,
		activity: activity.rows.map((row) => ({ ...row, description: describeAuditRow(row) })),
		hasMore: activity.hasMore,
		statusFilter: statusFilter ?? null
	};
};
