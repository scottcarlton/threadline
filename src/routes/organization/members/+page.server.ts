import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals }) => {
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

	// Connection invites (shareable links for external rep agencies) — brand orgs only
	const isBrandOrg = locals.orgType === 'brand';
	const isAdmin = ['admin', 'owner'].includes(locals.membership?.role ?? '');
	let connectionInvites: Array<{
		id: string;
		code: string;
		expires_at: string;
		max_uses: number;
		use_count: number;
		auto_approve: boolean;
		created_at: string;
	}> = [];
	if (isBrandOrg && isAdmin) {
		const { data: connInvData } = await supabase
			.from('connection_invites')
			.select('id, code, expires_at, max_uses, use_count, auto_approve, created_at')
			.eq('brand_org_id', organization.id)
			.order('created_at', { ascending: false });
		connectionInvites = connInvData ?? [];
	}

	return {
		members: members ?? [],
		invitations: invResult.data ?? [],
		brands: brandsResult.data ?? [],
		memberBrandCommissions: commissionsResult.data ?? [],
		scopedMemberIds: Array.from(scopedMemberIds),
		memberEmails: emailMap,
		connectionInvites,
		isBrandOrg,
		isAdmin
	};
};
