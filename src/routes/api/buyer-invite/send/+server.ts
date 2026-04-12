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

	const { email, accountId, brandIds } = await request.json();

	if (!email || !accountId) {
		return json({ error: 'Missing required fields: email, accountId' }, { status: 400 });
	}

	// Verify account belongs to org
	const { data: account } = await supabaseAdmin
		.from('accounts')
		.select('id, organization_id')
		.eq('id', accountId)
		.eq('organization_id', organization.id)
		.single();

	if (!account) {
		return json({ error: 'Account not found' }, { status: 404 });
	}

	// Check for existing pending buyer invitation
	const { data: existingInvite } = await supabaseAdmin
		.from('buyer_invitations')
		.select('id')
		.eq('account_id', accountId)
		.eq('email', email)
		.is('accepted_at', null)
		.single();

	if (existingInvite) {
		return json({ error: 'An invitation is already pending for this email' }, { status: 409 });
	}

	// Check if user already exists in the system
	const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
	const matchingUser = existingUser?.users?.find((u) => u.email === email);
	if (matchingUser) {
		const { data: existingBuyer } = await supabaseAdmin
			.from('account_users')
			.select('id')
			.eq('account_id', accountId)
			.eq('profile_id', matchingUser.id)
			.single();

		if (existingBuyer) {
			return json({ error: 'This user already has access to this account' }, { status: 409 });
		}

		// User exists but isn't a buyer for this account — auto-add them
		await supabaseAdmin.from('account_users').insert({
			account_id: accountId,
			profile_id: matchingUser.id,
			role: 'buyer',
			invited_by: membership.profile_id,
			accepted_at: new Date().toISOString()
		});

		// Create account_brand_access for selected brands
		if (Array.isArray(brandIds) && brandIds.length > 0) {
			const brandAccessRows = brandIds.map((brandId: string) => ({
				account_id: accountId,
				brand_id: brandId,
				organization_id: organization.id,
				granted_by: membership.profile_id
			}));
			await supabaseAdmin
				.from('account_brand_access')
				.upsert(brandAccessRows, { onConflict: 'account_id,brand_id' });
		}

		return json({ success: true, autoAdded: true });
	}

	// User doesn't exist yet — create a pending invitation
	const { data: invitation, error: insertError } = await supabaseAdmin
		.from('buyer_invitations')
		.insert({
			account_id: accountId,
			organization_id: organization.id,
			email,
			invited_by: membership.profile_id
		})
		.select('token')
		.single();

	if (insertError) {
		return json({ error: insertError.message }, { status: 500 });
	}

	// Create account_brand_access for selected brands
	if (Array.isArray(brandIds) && brandIds.length > 0) {
		const brandAccessRows = brandIds.map((brandId: string) => ({
			account_id: accountId,
			brand_id: brandId,
			organization_id: organization.id,
			granted_by: membership.profile_id
		}));
		await supabaseAdmin
			.from('account_brand_access')
			.upsert(brandAccessRows, { onConflict: 'account_id,brand_id' });
	}

	return json({ success: true, token: invitation.token });
};
