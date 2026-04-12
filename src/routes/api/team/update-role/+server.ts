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
		.select('role')
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

	return json({ success: true });
};
