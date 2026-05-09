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

	const { memberId, managesOthers } = await request.json();

	if (!memberId || typeof managesOthers !== 'boolean') {
		return json({ error: 'Missing or invalid fields' }, { status: 400 });
	}

	const { data: target } = await supabaseAdmin
		.from('organization_members')
		.select('id, role')
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

	return json({ success: true });
};
