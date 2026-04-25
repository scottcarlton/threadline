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

	// Resolve effective brand list. If the inviter didn't pick any chips, grant
	// access to every active brand in the inviting org — otherwise the buyer
	// lands with no brands/products and can't shop. For a single-brand BOA
	// this is the desired default; for multi-brand orgs the inviter can still
	// scope by passing explicit brandIds.
	let effectiveBrandIds = Array.isArray(brandIds) ? (brandIds as string[]) : [];
	if (effectiveBrandIds.length === 0) {
		const { data: orgBrands } = await supabaseAdmin
			.from('brands')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('is_active', true);
		effectiveBrandIds = (orgBrands ?? []).map((b: { id: string }) => b.id);
	}

	// First buyer onboarded for an account becomes its buyer_admin so the
	// account can self-serve team management going forward. Subsequent
	// rep-side invites default to plain 'buyer'.
	const { data: existingAdmins } = await supabaseAdmin
		.from('account_users')
		.select('id')
		.eq('account_id', accountId)
		.eq('role', 'buyer_admin')
		.limit(1);
	const assignedRole = existingAdmins && existingAdmins.length > 0 ? 'buyer' : 'buyer_admin';

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
			role: assignedRole,
			invited_by: membership.profile_id,
			accepted_at: new Date().toISOString()
		});

		// Create account_brand_access for the effective brand list
		if (effectiveBrandIds.length > 0) {
			const brandAccessRows = effectiveBrandIds.map((brandId: string) => ({
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
			invited_by: membership.profile_id,
			role: assignedRole
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
