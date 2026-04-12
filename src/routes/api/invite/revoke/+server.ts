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

	const { invitationId } = await request.json();

	if (!invitationId) {
		return json({ error: 'Missing invitation ID' }, { status: 400 });
	}

	const { error } = await supabaseAdmin
		.from('invitations')
		.delete()
		.eq('id', invitationId)
		.eq('organization_id', organization.id);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
