import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { fetchActivity, describeAuditRow } from '$lib/server/audit/query.js';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { data: org, error: orgError } = await supabaseAdmin
		.from('organizations')
		.select('id, name, slug, org_type, created_at, city, state, country')
		.eq('id', params.id)
		.maybeSingle();

	if (orgError) throw orgError;
	if (!org) throw error(404, 'Organization not found');

	const statusFilter = url.searchParams.get('status') === 'failure' ? 'failure' : undefined;

	const [membersResult, activity] = await Promise.all([
		supabaseAdmin
			.from('organization_members')
			.select(
				'id, role, created_at, profile_id, profiles!organization_members_profile_id_fkey(display_name)'
			)
			.eq('organization_id', org.id)
			.order('created_at'),
		fetchActivity({ organizationId: org.id, status: statusFilter, limit: 100 })
	]);

	type MemberRow = {
		id: string;
		role: string;
		created_at: string;
		profile_id: string;
		profiles: { display_name?: string } | { display_name?: string }[] | null;
	};

	const members = ((membersResult.data ?? []) as MemberRow[]).map((m) => {
		const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
		return {
			id: m.id,
			profileId: m.profile_id,
			role: m.role,
			joinedAt: m.created_at,
			displayName: profile?.display_name ?? 'Unknown'
		};
	});

	// Auditing the auditor: opening an org's record is itself a cross-tenant
	// read, so it goes in the log alongside everything else.
	locals.audit.record('system.org_viewed', {
		organizationId: org.id,
		organizationName: org.name,
		subjectId: org.id,
		subjectLabel: org.name
	});

	return {
		organization: {
			id: org.id,
			name: org.name,
			slug: org.slug,
			orgType: org.org_type,
			createdAt: org.created_at,
			location: [org.city, org.state, org.country].filter(Boolean).join(', ')
		},
		members,
		activity: activity.rows.map((row) => ({ ...row, description: describeAuditRow(row) })),
		hasMore: activity.hasMore,
		statusFilter: statusFilter ?? null
	};
};
