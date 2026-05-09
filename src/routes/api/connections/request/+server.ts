import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { recordConnectInviteUse } from '$lib/server/connections.js';
import { notifyOrgAdmins } from '$lib/server/notifications.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, organization, orgType, membership } = locals;
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
	if (invite.expires_at && new Date(invite.expires_at) < new Date())
		return json({ error: 'Invite code has expired' }, { status: 410 });
	if (invite.max_uses > 0 && invite.use_count >= invite.max_uses)
		return json({ error: 'Invite code has reached max uses' }, { status: 410 });

	// Atomically claim the invite when single-use (max_uses > 0).
	// Prevents two reps from racing to redeem the same one-time link.
	if (invite.max_uses > 0) {
		const { data: claimed } = await supabaseAdmin
			.from('connection_invites')
			.update({
				use_count: invite.use_count + 1,
				last_used_at: new Date().toISOString()
			})
			.eq('id', invite.id)
			.lt('use_count', invite.max_uses)
			.select('id')
			.maybeSingle();

		if (!claimed) return json({ error: 'Invite code has reached max uses' }, { status: 410 });
	}

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

	// Create the connection — auto-approve skips the pending state
	const autoApprove = Boolean(invite.auto_approve);
	const commissionRate = Number(invite.commission_rate) || 0;
	const { data: connection, error: connError } = await supabaseAdmin
		.from('org_connections')
		.insert({
			rep_org_id: organization.id,
			brand_org_id: invite.brand_org_id,
			rep_brand_id: repBrandId || null,
			status: autoApprove ? 'active' : 'pending',
			requested_by: session.user.id,
			commission_rate: commissionRate,
			...(autoApprove
				? { approved_by: invite.created_by, connected_at: new Date().toISOString() }
				: {})
		})
		.select()
		.single();

	if (connError) return json({ error: connError.message }, { status: 500 });

	// Propagate commission rate to the rep's local brand row if provided.
	if (repBrandId && commissionRate > 0) {
		await supabaseAdmin
			.from('brands')
			.update({ commission_rate: commissionRate })
			.eq('id', repBrandId)
			.eq('organization_id', organization.id);
	}

	// Apply per-partner attributes the brand admin pre-set on the invite:
	// - manages_others → connection_members row for this user on the new connection
	// - territory_ids  → member_territories rows for this user's rep-org membership
	// Apply at request time regardless of auto-approve. For pending connections
	// these rows sit dormant until the brand admin approves; no further action
	// needed in /api/connections/approve.
	await supabaseAdmin.from('connection_members').upsert(
		{
			org_connection_id: connection.id,
			profile_id: session.user.id,
			manages_others: Boolean(invite.manages_others),
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'org_connection_id,profile_id' }
	);

	const inviteTerritoryIds = Array.isArray(invite.territory_ids)
		? (invite.territory_ids as string[])
		: [];
	if (inviteTerritoryIds.length > 0) {
		const { data: repMembership } = await supabaseAdmin
			.from('organization_members')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('profile_id', session.user.id)
			.maybeSingle();
		if (repMembership?.id) {
			const rows = inviteTerritoryIds.map((territoryId) => ({
				organization_member_id: repMembership.id,
				territory_id: territoryId
			}));
			await supabaseAdmin.from('member_territories').upsert(rows, {
				onConflict: 'organization_member_id,territory_id',
				ignoreDuplicates: true
			});
		}
	}

	// Stamp usage telemetry on the invite (use_count, last_used_at).
	// For single-use invites, the atomic claim above already incremented; for
	// unlimited invites (max_uses = 0) we still need the legacy counter bump.
	if (invite.max_uses === 0) {
		await recordConnectInviteUse(supabaseAdmin, code);
	}

	const inviteOrgs = (invite as { organizations?: { name?: string } | { name?: string }[] | null })
		.organizations;
	const brandOrg = Array.isArray(inviteOrgs) ? inviteOrgs[0] : inviteOrgs;

	notifyOrgAdmins(invite.brand_org_id, session.user.id, {
		type: autoApprove ? 'connection_auto_approved' : 'connection_request',
		title: autoApprove ? 'New rep auto-connected' : 'New connection request',
		body: autoApprove
			? `${organization.name} connected via auto-approve invite`
			: `${organization.name} has requested to connect`,
		link: '/organization/partners'
	});

	return json({ connection, brandName: brandOrg?.name, autoApproved: autoApprove });
};
