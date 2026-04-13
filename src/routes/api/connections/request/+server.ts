import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, supabase, organization, orgType, membership } = locals;
	if (!session || !organization) return json({ error: 'Unauthorized' }, { status: 401 });
	if (orgType !== 'rep')
		return json({ error: 'Only rep orgs can request connections' }, { status: 403 });
	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Admin or owner required' }, { status: 403 });
	}

	const { code, repBrandId } = await request.json();
	if (!code) return json({ error: 'Invite code required' }, { status: 400 });

	// Look up the invite (use admin to bypass RLS for cross-org read)
	const { data: invite } = await supabaseAdmin
		.from('connection_invites')
		.select('*, organizations:brand_org_id(id, name)')
		.eq('code', code)
		.single();

	if (!invite) return json({ error: 'Invalid invite code' }, { status: 404 });
	if (new Date(invite.expires_at) < new Date())
		return json({ error: 'Invite code has expired' }, { status: 410 });
	if (invite.max_uses > 0 && invite.use_count >= invite.max_uses)
		return json({ error: 'Invite code has reached max uses' }, { status: 410 });

	// Check if connection already exists
	const { data: existing } = await supabaseAdmin
		.from('org_connections')
		.select('id, status')
		.eq('rep_org_id', organization.id)
		.eq('brand_org_id', invite.brand_org_id)
		.single();

	if (existing) {
		if (existing.status === 'active')
			return json({ error: 'Already connected to this brand' }, { status: 409 });
		if (existing.status === 'pending')
			return json({ error: 'Connection request already pending' }, { status: 409 });
	}

	// Create the connection request
	const { data: connection, error: connError } = await supabaseAdmin
		.from('org_connections')
		.insert({
			rep_org_id: organization.id,
			brand_org_id: invite.brand_org_id,
			rep_brand_id: repBrandId || null,
			status: 'pending',
			requested_by: session.user.id
		})
		.select()
		.single();

	if (connError) return json({ error: connError.message }, { status: 500 });

	// Increment invite use count
	await supabaseAdmin
		.from('connection_invites')
		.update({ use_count: invite.use_count + 1 })
		.eq('id', invite.id);

	return json({ connection, brandName: (invite as any).organizations?.name });
};
