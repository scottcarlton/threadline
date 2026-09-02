import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { membership, organization } = locals;

	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	if (!organization) {
		return json({ error: 'No organization found' }, { status: 400 });
	}

	const { memberId, role, commission_rate } = await request.json();

	if (!memberId) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	if (role && !['admin', 'member', 'sales', 'guest'].includes(role)) {
		return json({ error: 'Invalid role' }, { status: 400 });
	}

	// Prevent modifying the owner
	const { data: targetMember } = await supabaseAdmin
		.from('organization_members')
		// Existing role and rate are read anyway for the owner/self guards below.
		// Keeping them lets the audit row carry a real before/after diff.
		.select(
			'role, commission_rate, profile_id, profiles!organization_members_profile_id_fkey(display_name)'
		)
		.eq('id', memberId)
		.eq('organization_id', organization.id)
		.single();

	if (!targetMember) {
		return json({ error: 'Member not found' }, { status: 404 });
	}

	// Prevent changing the owner's role (but allow commission updates)
	if (targetMember.role === 'owner' && role) {
		return json({ error: 'Cannot change the owner role' }, { status: 403 });
	}

	// Prevent changing own role (but allow commission updates)
	if (memberId === membership.id && role) {
		return json({ error: 'Cannot change your own role' }, { status: 403 });
	}

	const updateData: Record<string, unknown> = {};
	if (role) updateData.role = role;
	if (commission_rate !== undefined) updateData.commission_rate = commission_rate;

	if (Object.keys(updateData).length === 0) {
		return json({ error: 'Nothing to update' }, { status: 400 });
	}

	const { error: updateError } = await supabaseAdmin
		.from('organization_members')
		.update(updateData)
		.eq('id', memberId)
		.eq('organization_id', organization.id);

	if (updateError) {
		return json({ error: updateError.message }, { status: 500 });
	}

	const targetProfile = targetMember.profiles as
		| { display_name?: string }
		| { display_name?: string }[]
		| null;
	const subjectLabel =
		(Array.isArray(targetProfile) ? targetProfile[0]?.display_name : targetProfile?.display_name) ??
		null;

	// This endpoint updates two independent things. Each gets its own event, and
	// only when it actually moved: a commission edit must not claim the member's
	// role changed, and re-saving the same value is not a change at all.
	if (role && role !== targetMember.role) {
		locals.audit.record('member.role_changed', {
			subjectId: targetMember.profile_id,
			subjectLabel,
			changes: { role: { before: targetMember.role, after: role } }
		});
	}
	if (
		commission_rate !== undefined &&
		Number(commission_rate) !== Number(targetMember.commission_rate)
	) {
		locals.audit.record('member.commission_changed', {
			subjectId: targetMember.profile_id,
			subjectLabel,
			metadata: { scope: 'organization' },
			changes: {
				commission_rate: { before: targetMember.commission_rate, after: commission_rate }
			}
		});
	}

	return json({ success: true });
};
