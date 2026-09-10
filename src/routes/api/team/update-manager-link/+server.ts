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

	const { memberId, managerId } = await request.json();

	if (!memberId) {
		return json({ error: 'Missing memberId' }, { status: 400 });
	}

	// Normalize: empty string / undefined / null all mean "no manager".
	const nextManagerId: string | null =
		typeof managerId === 'string' && managerId.length > 0 ? managerId : null;

	if (nextManagerId === memberId) {
		return json({ error: 'A member cannot manage themselves' }, { status: 400 });
	}

	const { data: target } = await supabaseAdmin
		.from('organization_members')
		.select(
			'id, organization_id, profile_id, profiles!organization_members_profile_id_fkey(display_name)'
		)
		.eq('id', memberId)
		.eq('organization_id', organization.id)
		.maybeSingle();

	if (!target) {
		return json({ error: 'Member not found' }, { status: 404 });
	}

	// The DB trigger `validate_org_member_manager` enforces same-org,
	// eligible-manager role, and cycle checks — let it surface failures.
	const { error: updateError } = await supabaseAdmin
		.from('organization_members')
		.update({ manager_id: nextManagerId })
		.eq('id', memberId)
		.eq('organization_id', organization.id);

	if (updateError) {
		return json({ error: updateError.message }, { status: 400 });
	}

	locals.audit.record('member.reporting_changed', {
		subjectId: target.profile_id,
		subjectLabel: memberName(target.profiles),
		metadata: { memberId },
		changes: { manager_id: { after: nextManagerId } }
	});

	return json({ success: true });
};
