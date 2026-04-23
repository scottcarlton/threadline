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

	const [invResult, brandsResult, commissionsResult, brandAccessResult, connsResult] =
		await Promise.all([
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
			supabase.from('member_brand_access').select('member_id'),
			supabase
				.from('org_connections')
				.select('brand_org_id, commission_rate')
				.eq('rep_org_id', organization.id)
				.eq('status', 'active')
		]);

	// Connected brands: commission is set at the connection (org) level, not per-member.
	// Fetch brand rows for each connected brand org and merge the connection rate.
	const connectionRateByBrandOrg = new Map<string, number>();
	for (const c of connsResult.data ?? []) {
		if (c.brand_org_id && c.commission_rate != null) {
			connectionRateByBrandOrg.set(c.brand_org_id, Number(c.commission_rate));
		}
	}
	const brandOrgIds = Array.from(connectionRateByBrandOrg.keys());
	const connectedBrandsRaw = brandOrgIds.length
		? (
				await supabase
					.from('brands')
					.select('id, name, organization_id')
					.in('organization_id', brandOrgIds)
					.eq('is_active', true)
					.order('name')
			).data
		: [];
	const connectedBrands = (connectedBrandsRaw ?? []).map((b) => ({
		id: b.id,
		name: b.name,
		rate: connectionRateByBrandOrg.get(b.organization_id) ?? 0
	}));

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

	const isBrandOrg = locals.orgType === 'brand';
	const isAdmin = ['admin', 'owner'].includes(locals.membership?.role ?? '');

	return {
		members: members ?? [],
		invitations: invResult.data ?? [],
		brands: brandsResult.data ?? [],
		connectedBrands,
		memberBrandCommissions: commissionsResult.data ?? [],
		scopedMemberIds: Array.from(scopedMemberIds),
		memberEmails: emailMap,
		isBrandOrg,
		isAdmin
	};
};
