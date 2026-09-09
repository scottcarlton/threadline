import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

/** Supabase types a single-row join as object-or-array; normalise both. */
function memberName(rel: unknown): string | null {
	const p = rel as { display_name?: string } | { display_name?: string }[] | null;
	return (Array.isArray(p) ? p[0]?.display_name : p?.display_name) ?? null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { membership, organization } = locals;

	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}
	if (!organization) {
		return json({ error: 'No organization found' }, { status: 400 });
	}

	const { memberId, managesOthers } = await request.json();

	if (!memberId || typeof managesOthers !== 'boolean') {
		return json({ error: 'Missing or invalid fields' }, { status: 400 });
	}

	const { data: target } = await supabaseAdmin
		.from('organization_members')
		.select('id, role, profile_id, profiles!organization_members_profile_id_fkey(display_name)')
		.eq('id', memberId)
		.eq('organization_id', organization.id)
		.maybeSingle();

	if (!target) {
		return json({ error: 'Member not found' }, { status: 404 });
	}

	// Only member/sales roles carry this flag. admin/owner already manage everything;
	// guest has no team scope to manage.
	if (!['member', 'sales'].includes(target.role)) {
		return json({ error: 'Manages-others only applies to member or sales roles' }, { status: 400 });
	}

	const { error: updateError } = await supabaseAdmin
		.from('organization_members')
		.update({ manages_others: managesOthers })
		.eq('id', memberId)
		.eq('organization_id', organization.id);

	if (updateError) {
		return json({ error: updateError.message }, { status: 500 });
	}

	locals.audit.record('member.reporting_changed', {
		subjectId: target.profile_id,
		subjectLabel: memberName(target.profiles),
		metadata: { memberId },
		changes: { manages_others: { after: managesOthers } }
	});

	return json({ success: true });
};
