import { redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { PageServerLoad } from './$types';

export type TeamMember = {
	profileId: string;
	displayName: string;
	email: string | null;
	role: 'buyer' | 'buyer_admin';
	isSelf: boolean;
};

export type PendingInvite = {
	id: string;
	email: string;
	invitedAt: string;
	expiresAt: string;
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.isBuyer || !locals.user) throw redirect(303, '/insight');

	// Caller must be a buyer_admin of at least one account to see this page.
	const { data: adminRows } = await supabaseAdmin
		.from('account_users')
		.select('account_id')
		.eq('profile_id', locals.user.id)
		.eq('role', 'buyer_admin');

	const adminAccountIds = (adminRows ?? []).map((r) => r.account_id);
	if (adminAccountIds.length === 0) throw redirect(303, '/account');

	const [usersRes, invitesRes] = await Promise.all([
		supabaseAdmin
			.from('account_users')
			.select('profile_id, role, profiles(display_name)')
			.in('account_id', adminAccountIds),
		supabaseAdmin
			.from('buyer_invitations')
			.select('id, email, created_at, expires_at')
			.in('account_id', adminAccountIds)
			.is('accepted_at', null)
			.gt('expires_at', new Date().toISOString())
			.order('created_at', { ascending: false })
	]);

	type Row = {
		profile_id: string;
		role: string;
		profiles: { display_name: string } | { display_name: string }[] | null;
	};

	const dedup = new Map<string, TeamMember>();
	for (const row of (usersRes.data ?? []) as unknown as Row[]) {
		if (dedup.has(row.profile_id)) continue;
		const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
		dedup.set(row.profile_id, {
			profileId: row.profile_id,
			displayName: profile?.display_name ?? '—',
			email: null,
			role: (row.role === 'buyer_admin' ? 'buyer_admin' : 'buyer') as 'buyer' | 'buyer_admin',
			isSelf: row.profile_id === locals.user!.id
		});
	}

	for (const m of dedup.values()) {
		const { data } = await supabaseAdmin.auth.admin.getUserById(m.profileId);
		m.email = data?.user?.email ?? null;
	}

	// Dedup invites by email (a buyer-admin invite creates one row per account
	// but we only want to show one card per pending teammate).
	const inviteByEmail = new Map<string, PendingInvite>();
	for (const inv of invitesRes.data ?? []) {
		const key = inv.email.toLowerCase();
		if (inviteByEmail.has(key)) continue;
		inviteByEmail.set(key, {
			id: inv.id,
			email: inv.email,
			invitedAt: inv.created_at,
			expiresAt: inv.expires_at
		});
	}

	return {
		members: Array.from(dedup.values()).sort((a, b) => {
			if (a.isSelf && !b.isSelf) return -1;
			if (!a.isSelf && b.isSelf) return 1;
			return a.displayName.localeCompare(b.displayName);
		}),
		pendingInvites: Array.from(inviteByEmail.values())
	};
};
