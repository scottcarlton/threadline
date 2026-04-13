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

	// Check if user is already a member
	const { data: existingProfile } = await supabaseAdmin
		.from('profiles')
		.select('id')
		.eq(
			'id',
			(await supabaseAdmin.auth.admin.listUsers()).data.users.find((u) => u.email === email)?.id ??
				''
		)
		.single();

	if (existingProfile) {
		const { data: existingMember } = await supabaseAdmin
			.from('organization_members')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('profile_id', existingProfile.id)
			.single();

		if (existingMember) {
			return json({ error: 'User is already a member of this organization' }, { status: 409 });
		}
	}

	// Check for existing pending invitation
	const { data: existingInvite } = await supabaseAdmin
		.from('invitations')
		.select('id')
		.eq('organization_id', organization.id)
		.eq('email', email)
		.is('accepted_at', null)
		.single();

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
		brand_ids: Array.isArray(brandIds) ? brandIds : [],
		token,
		invited_by: membership.profile_id,
		expires_at: expiresAt.toISOString()
	});

	if (insertError) {
		return json({ error: insertError.message }, { status: 500 });
	}

	return json({ success: true, token });
};
