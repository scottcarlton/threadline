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

	const { memberId } = await request.json();

	if (!memberId) {
		return json({ error: 'Missing member ID' }, { status: 400 });
	}

	// Prevent removing the owner
	const { data: targetMember } = await supabaseAdmin
		.from('organization_members')
		// profile_id and the display name so the audit row names a person rather
		// than a membership row id nobody can resolve after the row is gone.
		.select('role, profile_id, profiles!organization_members_profile_id_fkey(display_name)')
		.eq('id', memberId)
		.eq('organization_id', organization.id)
		.single();

	if (!targetMember) {
		return json({ error: 'Member not found' }, { status: 404 });
	}

	if (targetMember.role === 'owner') {
		return json({ error: 'Cannot remove the owner' }, { status: 403 });
	}

	// Prevent removing yourself
	if (memberId === membership.id) {
		return json({ error: 'Cannot remove yourself' }, { status: 403 });
	}

	// Remove brand access entries first
	await supabaseAdmin.from('member_brand_access').delete().eq('member_id', memberId);

	// Remove the member
	const { error: deleteError } = await supabaseAdmin
		.from('organization_members')
		.delete()
		.eq('id', memberId)
		.eq('organization_id', organization.id);

	if (deleteError) {
		return json({ error: deleteError.message }, { status: 500 });
	}

	const removedProfile = targetMember.profiles as
		| { display_name?: string }
		| { display_name?: string }[]
		| null;
	locals.audit.record('member.removed', {
		subjectId: targetMember.profile_id,
		subjectLabel:
			(Array.isArray(removedProfile)
				? removedProfile[0]?.display_name
				: removedProfile?.display_name) ?? null,
		metadata: { role: targetMember.role, memberId }
	});

	return json({ success: true });
};
