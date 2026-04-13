import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	const { session, supabase, organization, orgType, membership } = locals;
	if (!session || !organization) return json({ error: 'Unauthorized' }, { status: 401 });
	if (orgType !== 'brand')
		return json({ error: 'Only brand orgs can create invite codes' }, { status: 403 });
	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Admin or owner required' }, { status: 403 });
	}

	const { data: invite, error } = await supabase
		.from('connection_invites')
		.insert({
			brand_org_id: organization.id,
			created_by: session.user.id
		})
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 500 });

	return json({ invite });
};
