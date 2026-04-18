import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { listConnectedReps } from '$lib/server/federation.js';
import {
	getOrCreateConnectInvite,
	refreshConnectInvite,
	type ConnectInvite
} from '$lib/server/connections.js';

type MemberRow = {
	id: string;
	profile_id: string;
	role: string;
	profiles: { id: string; display_name: string | null; avatar_url: string | null } | null;
};

type InvitationRow = {
	id: string;
	email: string;
	role: string;
	token: string;
	created_at: string;
	expires_at: string;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const { supabase, organization, orgType } = locals;

	if (!organization) throw redirect(303, '/insight');

	// Only brand orgs use the /reps page
	if (orgType !== 'brand') {
		throw redirect(303, '/insight');
	}

	const orgId = organization.id;

	// Get org members (internal reps — members with sales/member/admin/owner roles)
	// Hint the FK: organization_members has two FKs to profiles (profile_id + invited_by),
	// so the embed is ambiguous without the fkey name.
	const { data: membersRaw } = await supabase
		.from('organization_members')
		.select(
			'id, profile_id, role, profiles!organization_members_profile_id_fkey(id, display_name, avatar_url)'
		)
		.eq('organization_id', orgId)
		.eq('role', 'sales');

	const members = (membersRaw ?? []) as unknown as MemberRow[];

	// Get order stats per member (created_by)
	const { data: orders } = await supabase
		.from('orders')
		.select('created_by, total_amount, status')
		.eq('organization_id', orgId)
		.not('status', 'eq', 'cancelled');

	const memberStats = new Map<string, { orderCount: number; revenue: number }>();
	for (const order of orders ?? []) {
		const existing = memberStats.get(order.created_by) ?? { orderCount: 0, revenue: 0 };
		existing.orderCount++;
		existing.revenue += Number(order.total_amount);
		memberStats.set(order.created_by, existing);
	}

	const reps = members.map((m) => ({
		id: m.id,
		profileId: m.profile_id,
		name: m.profiles?.display_name ?? 'Unknown',
		avatarUrl: m.profiles?.avatar_url ?? null,
		role: m.role,
		orderCount: memberStats.get(m.profile_id)?.orderCount ?? 0,
		revenue: memberStats.get(m.profile_id)?.revenue ?? 0
	}));

	const { data: selfBrandRow } = await supabase
		.from('brands')
		.select('id')
		.eq('organization_id', orgId)
		.eq('is_self_brand', true)
		.maybeSingle();
	const selfBrandId = selfBrandRow?.id ?? null;

	const { data: invitationsRaw } = await supabase
		.from('invitations')
		.select('id, email, role, token, created_at, expires_at')
		.eq('organization_id', orgId)
		.eq('role', 'sales')
		.is('accepted_at', null)
		.order('created_at', { ascending: false });

	const pendingInvites = (invitationsRaw ?? []) as InvitationRow[];

	// Sidebar: shareable connect link (Admin/Owner only).
	const isAdmin = ['admin', 'owner'].includes(locals.membership?.role ?? '');
	let connectInvite: ConnectInvite | null = null;
	if (isAdmin && locals.session) {
		connectInvite = await getOrCreateConnectInvite(supabaseAdmin, orgId, locals.session.user.id);
	}

	// Connected external rep orgs (federation)
	const connectedReps = await listConnectedReps(supabaseAdmin, orgId);

	return {
		reps,
		pendingInvites,
		selfBrandId,
		connectInvite,
		origin: url.origin,
		isAdmin,
		connectedReps
	};
};

export const actions: Actions = {
	refreshInvite: async ({ locals }) => {
		const role = locals.membership?.role;
		if (!role || !['admin', 'owner'].includes(role)) {
			return fail(403, { message: 'Not authorized' });
		}
		if (!locals.organization || locals.orgType !== 'brand') {
			return fail(400, { message: 'Only brand orgs can refresh invites' });
		}
		try {
			await refreshConnectInvite(supabaseAdmin, locals.organization.id);
			return { success: true };
		} catch {
			return fail(500, { message: 'Failed to refresh invite' });
		}
	}
};
