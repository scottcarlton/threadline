import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { sendEmail } from '$lib/server/email.js';
import { inviteParams } from '$lib/server/email-templates.js';
import templateIds from '../../../../../emails/template-ids.json';
import crypto from 'crypto';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const { membership, organization } = locals;

	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	if (!organization) {
		return json({ error: 'No organization found' }, { status: 400 });
	}

	const {
		email,
		role,
		brandIds,
		commissionRate,
		managesOthers: rawManagesOthers,
		managerId: rawManagerId,
		territoryIds: rawTerritoryIds
	} = await request.json();

	if (!email || !role) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	if (!['admin', 'member', 'sales', 'guest'].includes(role)) {
		return json({ error: 'Invalid role' }, { status: 400 });
	}

	const scopedBrandIds = Array.isArray(brandIds) ? (brandIds as string[]) : [];
	// Territory assignments are sales-only; ignore for other roles.
	const scopedTerritoryIds =
		role === 'sales' && Array.isArray(rawTerritoryIds) ? (rawTerritoryIds as string[]) : [];

	// Commission is only meaningful for sales members. Clamp to 0–100 and
	// ignore for every other role so a stale client value can't slip in.
	let commission = 0;
	if (role === 'sales' && commissionRate != null) {
		const n = Number(commissionRate);
		if (Number.isFinite(n)) commission = Math.min(100, Math.max(0, n));
	}

	// manages_others only applies to member/sales roles.
	const manages_others = (role === 'member' || role === 'sales') && rawManagesOthers === true;

	// manager_id: accept explicit client value; when omitted, auto-link to the
	// inviter if they are eligible to manage (admin/owner OR manages_others=true)
	// and the invitee is a member/sales.
	const inviterEligibleAsManager =
		membership.role === 'admin' ||
		membership.role === 'owner' ||
		membership.manages_others === true;
	let manager_id: string | null;
	if (rawManagerId === undefined) {
		manager_id =
			inviterEligibleAsManager && (role === 'member' || role === 'sales') ? membership.id : null;
	} else {
		manager_id = typeof rawManagerId === 'string' && rawManagerId.length > 0 ? rawManagerId : null;
	}

	// Look up any existing auth user for this email
	const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
	const matchingUser = usersList?.users?.find((u) => u.email === email) ?? null;

	if (matchingUser) {
		const { data: existingMember } = await supabaseAdmin
			.from('organization_members')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('profile_id', matchingUser.id)
			.maybeSingle();

		if (existingMember) {
			return json({ error: 'User is already a member of this organization' }, { status: 409 });
		}

		// User has a Threadline account but isn't a member yet — add them directly
		const { data: inserted, error: insertError } = await supabaseAdmin
			.from('organization_members')
			.insert({
				organization_id: organization.id,
				profile_id: matchingUser.id,
				role,
				commission_rate: commission,
				manages_others,
				manager_id,
				invited_by: membership.profile_id,
				accepted_at: new Date().toISOString()
			})
			.select('id')
			.single();

		if (insertError || !inserted) {
			return json({ error: insertError?.message ?? 'Failed to add member' }, { status: 500 });
		}

		if (scopedBrandIds.length > 0) {
			const rows = scopedBrandIds.map((brandId) => ({
				member_id: inserted.id,
				brand_id: brandId,
				granted_by: membership.profile_id
			}));
			await supabaseAdmin.from('member_brand_access').insert(rows);

			if (commission > 0) {
				const commissionRows = scopedBrandIds.map((brandId) => ({
					organization_id: organization.id,
					member_id: inserted.id,
					brand_id: brandId,
					rate: commission
				}));
				await supabaseAdmin.from('member_brand_commissions').insert(commissionRows);
			}
		}

		if (scopedTerritoryIds.length > 0) {
			const territoryRows = scopedTerritoryIds.map((territoryId) => ({
				organization_member_id: inserted.id,
				territory_id: territoryId
			}));
			await supabaseAdmin.from('member_territories').insert(territoryRows);
		}

		return json({ success: true, autoAdded: true });
	}

	// Check for existing pending invitation
	const { data: existingInvite } = await supabaseAdmin
		.from('invitations')
		.select('id')
		.eq('organization_id', organization.id)
		.eq('email', email)
		.is('accepted_at', null)
		.maybeSingle();

	if (existingInvite) {
		return json({ error: 'An invitation is already pending for this email' }, { status: 409 });
	}

	const token = crypto.randomUUID();
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 7);

	const { data: inserted, error: insertError } = await supabaseAdmin
		.from('invitations')
		.insert({
			organization_id: organization.id,
			email,
			role,
			brand_ids: scopedBrandIds,
			territory_ids: scopedTerritoryIds,
			commission_rate: commission,
			manages_others,
			manager_id,
			token,
			invited_by: membership.profile_id,
			expires_at: expiresAt.toISOString()
		})
		.select('id')
		.single();

	if (insertError) {
		return json({ error: insertError.message }, { status: 500 });
	}

	const { data: inviter } = await supabaseAdmin
		.from('profiles')
		.select('display_name')
		.eq('id', membership.profile_id)
		.single();

	const { data: inviterAuth } = await supabaseAdmin.auth.admin.getUserById(membership.profile_id);
	const inviterEmail = inviterAuth?.user?.email;
	const inviterName = inviter?.display_name || inviterEmail || 'A teammate';
	const acceptUrl = `${url.origin}/invite/${token}`;

	const emailResult = await sendEmail({
		to: email,
		subject: `${inviterName} invited you to ${organization.name} on /Threadline`,
		html: '',
		templateId: templateIds['invite-org-member'],
		params: inviteParams({ inviterName, organizationName: organization.name, acceptUrl, role }),
		replyTo: inviterEmail,
		template: 'invite',
		relatedType: 'invitation',
		relatedId: inserted?.id,
		profileId: membership.profile_id,
		organizationId: organization.id
	});

	return json({
		success: true,
		token,
		inviteUrl: `/invite/${token}`,
		emailSent: emailResult.ok
	});
};
