import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { sendEmail } from '$lib/server/email.js';
import { inviteParams } from '$lib/server/email-templates.js';
import templateIds from '../../../../../emails/template-ids.json';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user || !locals.isBuyer) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { email } = (await request.json()) as { email?: string };
	if (!email) {
		return json({ error: 'email is required' }, { status: 400 });
	}

	const trimmed = email.trim().toLowerCase();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
		return json({ error: 'Enter a valid email address.' }, { status: 400 });
	}

	// Find every account the caller is a buyer_admin of. The invite spans all
	// of them so the new teammate joins the full Fernwick-style identity in
	// one step.
	const { data: adminAccounts } = await supabaseAdmin
		.from('account_users')
		.select('account_id, accounts(id, business_name, organization_id)')
		.eq('profile_id', locals.user.id)
		.eq('role', 'buyer_admin');

	type AdminAccount = {
		account_id: string;
		accounts: { id: string; business_name: string; organization_id: string } | null;
	};

	const accounts = ((adminAccounts ?? []) as unknown as AdminAccount[])
		.map((row) => row.accounts)
		.filter((a): a is { id: string; business_name: string; organization_id: string } => !!a);

	if (accounts.length === 0) {
		return json({ error: 'You must be a buyer admin to invite teammates.' }, { status: 403 });
	}

	// If the user already exists in the system AND already has a row on every
	// admin account, there's nothing to do.
	const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
	const matchingUser = existingUser?.users?.find((u) => u.email?.toLowerCase() === trimmed);

	if (matchingUser) {
		const { data: existingMemberships } = await supabaseAdmin
			.from('account_users')
			.select('account_id')
			.eq('profile_id', matchingUser.id)
			.in(
				'account_id',
				accounts.map((a) => a.id)
			);

		const linkedIds = new Set((existingMemberships ?? []).map((r) => r.account_id));
		const missing = accounts.filter((a) => !linkedIds.has(a.id));

		if (missing.length === 0) {
			return json({ error: 'This person already has access to your account.' }, { status: 409 });
		}

		// Auto-add to the missing accounts; no email needed since they already
		// have a Threadline account.
		await supabaseAdmin.from('account_users').insert(
			missing.map((a) => ({
				account_id: a.id,
				profile_id: matchingUser.id,
				role: 'buyer',
				invited_by: locals.user!.id,
				accepted_at: new Date().toISOString()
			}))
		);

		return json({ success: true, autoAdded: true });
	}

	// New user — create one buyer_invitations row per admin account, all sharing
	// the same email. The accept handler fans out across siblings so a single
	// click links them everywhere at once.
	const { data: existingPending } = await supabaseAdmin
		.from('buyer_invitations')
		.select('account_id, token')
		.ilike('email', trimmed)
		.is('accepted_at', null);

	const pendingByAccount = new Map(
		(existingPending ?? []).map((r) => [r.account_id, r.token as string])
	);
	const accountsNeedingInvite = accounts.filter((a) => !pendingByAccount.has(a.id));

	const newRows = accountsNeedingInvite.map((a) => ({
		account_id: a.id,
		organization_id: a.organization_id,
		email: trimmed,
		invited_by: locals.user!.id,
		role: 'buyer'
	}));

	let firstToken: string | undefined = pendingByAccount.values().next().value ?? undefined;

	if (newRows.length > 0) {
		const { data: inserted, error: insertError } = await supabaseAdmin
			.from('buyer_invitations')
			.insert(newRows)
			.select('token');

		if (insertError) {
			return json({ error: insertError.message }, { status: 500 });
		}

		firstToken = firstToken ?? (inserted?.[0]?.token as string | undefined);
	}

	if (!firstToken) {
		return json({ error: 'Failed to create invitation.' }, { status: 500 });
	}

	const acceptUrl = `${url.origin}/buyer-invite/${firstToken}`;
	const businessName = accounts[0]?.business_name ?? 'your account';
	const inviterName =
		(await supabaseAdmin.from('profiles').select('display_name').eq('id', locals.user.id).single())
			.data?.display_name ?? 'A teammate';

	await sendEmail({
		to: trimmed,
		subject: `${inviterName} added you to ${businessName} on /Threadline`,
		html: '',
		templateId: templateIds['invite-buyer-team'],
		params: inviteParams({ inviterName, organizationName: businessName, acceptUrl }),
		template: 'buyer_team_invite',
		relatedType: 'buyer_invitation',
		relatedId: firstToken
	});

	return json({ success: true, token: firstToken });
};
