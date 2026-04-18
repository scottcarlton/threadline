import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import {
	getOrCreateConnectInvite,
	refreshConnectInvite,
	type ConnectInvite
} from '$lib/server/connections.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { supabase, organization } = locals;
	if (!organization) return { members: [], invitations: [] };

	const { data: members } = await supabase
		.from('organization_members')
		.select('*, profiles!organization_members_profile_id_fkey(*)')
		.eq('organization_id', organization.id)
		.order('created_at');

	const [invResult, brandsResult, commissionsResult, brandAccessResult] = await Promise.all([
		supabase
			.from('invitations')
			.select('*')
			.eq('organization_id', organization.id)
			.is('accepted_at', null)
			.order('created_at', { ascending: false }),
		supabase
			.from('brands')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('name'),
		supabase.from('member_brand_commissions').select('*').eq('organization_id', organization.id),
		supabase.from('member_brand_access').select('member_id')
	]);

	// Members with brand access are brand-scoped (not sales reps)
	const scopedMemberIds = new Set(
		(brandAccessResult.data ?? []).map((ba: { member_id: string }) => ba.member_id)
	);

	// Fetch emails from auth.users
	const profileIds = (members ?? []).map((m: { profile_id: string }) => m.profile_id);
	const emailMap: Record<string, string> = {};
	if (profileIds.length > 0) {
		const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
		for (const u of authUsers?.users ?? []) {
			if (profileIds.includes(u.id) && u.email) {
				emailMap[u.id] = u.email;
			}
		}
	}

	// Sidebar: shareable connect link (brand-org Admin/Owner only).
	const isBrandOrg = locals.orgType === 'brand';
	const isAdmin = ['admin', 'owner'].includes(locals.membership?.role ?? '');
	let connectInvite: ConnectInvite | null = null;
	if (isBrandOrg && isAdmin && locals.session) {
		connectInvite = await getOrCreateConnectInvite(
			supabaseAdmin,
			organization.id,
			locals.session.user.id
		);
	}

	return {
		members: members ?? [],
		invitations: invResult.data ?? [],
		brands: brandsResult.data ?? [],
		memberBrandCommissions: commissionsResult.data ?? [],
		scopedMemberIds: Array.from(scopedMemberIds),
		memberEmails: emailMap,
		connectInvite,
		origin: url.origin,
		isBrandOrg,
		isAdmin
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
