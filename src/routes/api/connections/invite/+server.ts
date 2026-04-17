import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, supabase, organization, orgType, membership } = locals;
	if (!session || !organization) return json({ error: 'Unauthorized' }, { status: 401 });
	if (orgType !== 'brand')
		return json({ error: 'Only brand orgs can create invite codes' }, { status: 403 });
	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Admin or owner required' }, { status: 403 });
	}

	// Optional body — callers may omit to accept defaults (30d expiry, unlimited uses).
	let body: { expires_at?: string | null; max_uses?: number | null; auto_approve?: boolean } = {};
	try {
		if (request.headers.get('content-type')?.includes('application/json')) {
			body = await request.json();
		}
	} catch {
		// No body is fine.
	}

	const insert: {
		brand_org_id: string;
		created_by: string;
		expires_at?: string;
		max_uses?: number;
		auto_approve?: boolean;
	} = {
		brand_org_id: organization.id,
		created_by: session.user.id
	};
	if (body.expires_at) insert.expires_at = body.expires_at;
	if (typeof body.max_uses === 'number' && body.max_uses >= 0) insert.max_uses = body.max_uses;
	if (typeof body.auto_approve === 'boolean') insert.auto_approve = body.auto_approve;

	const { data: invite, error } = await supabase
		.from('connection_invites')
		.insert(insert)
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 500 });
	return json({ invite });
};
