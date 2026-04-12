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
		.select('role')
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
	await supabaseAdmin
		.from('member_brand_access')
		.delete()
		.eq('member_id', memberId);

	// Remove the member
	const { error: deleteError } = await supabaseAdmin
		.from('organization_members')
		.delete()
		.eq('id', memberId)
		.eq('organization_id', organization.id);

	if (deleteError) {
		return json({ error: deleteError.message }, { status: 500 });
	}

	return json({ success: true });
};
