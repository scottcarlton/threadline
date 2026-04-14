import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import crypto from 'crypto';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { membership, organization } = locals;

	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	if (!organization) {
		return json({ error: 'No organization found' }, { status: 400 });
	}

	const { email, role, brandIds } = await request.json();

	if (!email || !role) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	if (!['admin', 'member', 'sales', 'guest'].includes(role)) {
		return json({ error: 'Invalid role' }, { status: 400 });
	}

	const scopedBrandIds = Array.isArray(brandIds) ? (brandIds as string[]) : [];

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

	const { error: insertError } = await supabaseAdmin.from('invitations').insert({
		organization_id: organization.id,
		email,
		role,
		brand_ids: scopedBrandIds,
		token,
		invited_by: membership.profile_id,
		expires_at: expiresAt.toISOString()
	});

	if (insertError) {
		return json({ error: insertError.message }, { status: 500 });
	}

	return json({ success: true, token, inviteUrl: `/invite/${token}` });
};
