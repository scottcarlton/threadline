import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

/**
 * Target user accepts a connection_member invite. They must be authenticated
 * and a member of the rep side of the connection named on the invite.
 *
 * On success, creates/upserts a connection_members row and applies the
 * invite's territory_ids to member_territories (scoped to the rep's
 * organization_members row on that rep org).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user?.id) {
		return json({ error: 'Must be signed in to accept' }, { status: 401 });
	}

	const { token } = await request.json();
	if (!token || typeof token !== 'string') {
		return json({ error: 'Missing token' }, { status: 400 });
	}

	// Load the invite
	const { data: invite, error: inviteError } = await supabaseAdmin
		.from('connection_member_invites')
		.select('*')
		.eq('token', token)
		.is('accepted_at', null)
		.maybeSingle();

	if (inviteError || !invite) {
		return json({ error: 'Invite not found or already used' }, { status: 404 });
	}
	if (new Date(invite.expires_at) < new Date()) {
		return json({ error: 'Invite has expired' }, { status: 410 });
	}

	// Resolve the rep side of the connection and verify the accepting user is
	// an active member of that rep org.
	const { data: connection } = await supabaseAdmin
		.from('org_connections')
		.select('id, rep_org_id, brand_org_id, status')
		.eq('id', invite.org_connection_id)
		.maybeSingle();
	if (!connection || connection.status !== 'active') {
		return json({ error: 'Connection is no longer active' }, { status: 410 });
	}

	const { data: repMember } = await supabaseAdmin
		.from('organization_members')
		.select('id, role')
		.eq('organization_id', connection.rep_org_id)
		.eq('profile_id', user.id)
		.maybeSingle();

	if (!repMember) {
		return json(
			{ error: 'You must be a member of the rep organization before accepting' },
			{ status: 403 }
		);
	}

	// Upsert connection_members row (idempotent if somehow already present).
	const { error: cmError } = await supabaseAdmin.from('connection_members').upsert(
		{
			org_connection_id: invite.org_connection_id,
			profile_id: user.id,
			manages_others: invite.manages_others,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'org_connection_id,profile_id' }
	);
	if (cmError) {
		return json({ error: cmError.message }, { status: 500 });
	}

	// Apply territory assignments to member_territories. RLS on that table
	// requires admin/owner of the territory.organization_id; we bypass via
	// supabaseAdmin because the invite already established brand authorization.
	if (invite.territory_ids?.length) {
		const rows = (invite.territory_ids as string[]).map((territoryId) => ({
			organization_member_id: repMember.id,
			territory_id: territoryId
		}));
		const { error: mtError } = await supabaseAdmin.from('member_territories').upsert(rows, {
			onConflict: 'organization_member_id,territory_id',
			ignoreDuplicates: true
		});
		if (mtError) {
			return json({ error: mtError.message }, { status: 500 });
		}
	}

	// Mark invite accepted.
	await supabaseAdmin
		.from('connection_member_invites')
		.update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
		.eq('id', invite.id);

	return json({ success: true });
};
