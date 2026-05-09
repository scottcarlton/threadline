import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { sendEmail } from '$lib/server/email.js';
import { inviteParams } from '$lib/server/email-templates.js';
import templateIds from '../../../../../emails/template-ids.json';

/**
 * Brand admin invites a specific user (by email) on the rep side of an
 * active org_connection to become a `connection_member` with per-connection
 * attributes (manages_others) and optional territory assignments.
 *
 * The target user must already have a Threadline account and be a member of
 * the rep side of the connection at accept time.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	const { membership, organization } = locals;

	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}
	if (!organization) {
		return json({ error: 'No organization found' }, { status: 400 });
	}

	const {
		connectionId,
		email,
		territoryIds: rawTerritoryIds,
		managesOthers: rawManagesOthers
	} = await request.json();

	if (!connectionId || typeof connectionId !== 'string') {
		return json({ error: 'Missing connectionId' }, { status: 400 });
	}
	const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
	if (!cleanEmail) {
		return json({ error: 'Missing email' }, { status: 400 });
	}

	// Verify the connection exists and this org is the brand side. Only the
	// brand side can invite a member from the rep side under the MBISR model.
	const { data: connection } = await supabaseAdmin
		.from('org_connections')
		.select('id, rep_org_id, brand_org_id, status')
		.eq('id', connectionId)
		.maybeSingle();

	if (!connection || connection.status !== 'active') {
		return json({ error: 'Connection not found or inactive' }, { status: 404 });
	}
	if (connection.brand_org_id !== organization.id) {
		return json(
			{ error: 'Only the brand org of the connection can invite members' },
			{ status: 403 }
		);
	}

	// Territory validation: every territory_id must belong to this brand's org.
	// Allows both brand-scoped (brand_id set) and brand-org-wide (brand_id NULL)
	// territories, as long as they're owned by this org.
	const territoryIds = Array.isArray(rawTerritoryIds) ? (rawTerritoryIds as string[]) : [];
	if (territoryIds.length > 0) {
		const { data: territories } = await supabaseAdmin
			.from('territories')
			.select('id, organization_id')
			.in('id', territoryIds);
		const badTerritory = (territories ?? []).find(
			(t: { organization_id: string }) => t.organization_id !== organization.id
		);
		if (badTerritory || (territories?.length ?? 0) !== territoryIds.length) {
			return json(
				{ error: 'One or more territories do not belong to your organization' },
				{ status: 400 }
			);
		}
	}

	// Check for an existing pending invite for this (connection, email).
	const { data: existing } = await supabaseAdmin
		.from('connection_member_invites')
		.select('id')
		.eq('org_connection_id', connectionId)
		.eq('target_email', cleanEmail)
		.is('accepted_at', null)
		.maybeSingle();
	if (existing) {
		return json({ error: 'An invite is already pending for this email' }, { status: 409 });
	}

	const { data: inserted, error: insertError } = await supabaseAdmin
		.from('connection_member_invites')
		.insert({
			org_connection_id: connectionId,
			target_email: cleanEmail,
			territory_ids: territoryIds,
			manages_others: rawManagesOthers === true,
			invited_by: membership.profile_id
		})
		.select('id, token')
		.single();

	if (insertError || !inserted) {
		return json({ error: insertError?.message ?? 'Failed to create invite' }, { status: 500 });
	}

	// Fire off the invite email. Reuse the existing invite template for now.
	const { data: inviter } = await supabaseAdmin
		.from('profiles')
		.select('display_name')
		.eq('id', membership.profile_id)
		.single();
	const { data: inviterAuth } = await supabaseAdmin.auth.admin.getUserById(membership.profile_id);
	const inviterName = inviter?.display_name || inviterAuth?.user?.email || 'A teammate';
	const acceptUrl = `${url.origin}/connect/member/${inserted.token}`;
	const emailResult = await sendEmail({
		to: cleanEmail,
		subject: `${inviterName} added you to ${organization.name} on /Threadline`,
		html: '',
		templateId: templateIds['invite-connection-member'],
		params: inviteParams({ inviterName, organizationName: organization.name, acceptUrl }),
		replyTo: inviterAuth?.user?.email,
		template: 'invite',
		relatedType: 'connection_member_invite',
		relatedId: inserted.id,
		profileId: membership.profile_id,
		organizationId: organization.id
	});

	return json({
		success: true,
		token: inserted.token,
		inviteUrl: `/connect/member/${inserted.token}`,
		emailSent: emailResult.ok
	});
};
