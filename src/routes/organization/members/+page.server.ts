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

	const [
		invResult,
		brandsResult,
		commissionsResult,
		brandAccessResult,
		connsResult,
		territoriesResult
	] = await Promise.all([
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
			.eq('status', 'active'),
		// Territories: own-org via membership + connected-brand's brand-scoped via RLS.
		// No .eq('organization_id', ...) here — we want the federated slice too.
		supabase.from('territories').select('id, name, brand_id, organization_id').order('name')
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

	// Eligible managers = anyone in the org allowed to own reports.
	// Admins and owners always qualify; members/sales qualify only when
	// manages_others is true. Used for the drawer's manager picker.
	type MemberRow = {
		id: string;
		role: string;
		manages_others: boolean;
		profiles?: { display_name?: string | null } | { display_name?: string | null }[] | null;
	};
	const eligibleManagers = (members ?? [])
		.filter((m: MemberRow) =>
			m.role === 'admin' || m.role === 'owner' ? true : m.manages_others === true
		)
		.map((m: MemberRow) => {
			const p = m.profiles;
			const name = Array.isArray(p) ? p[0]?.display_name : p?.display_name;
			return { id: m.id, name: name ?? '--', role: m.role };
		});

	// Brand name map for labeling brand-scoped territories in the picker.
	// Union of own-org brands + connected-brand orgs' brands (already loaded above).
	const brandNameById: Record<string, string> = {};
	for (const b of brandsResult.data ?? []) brandNameById[b.id] = b.name;
	for (const b of connectedBrandsRaw ?? []) brandNameById[b.id] = b.name;

	type TerritoryRow = {
		id: string;
		name: string;
		brand_id: string | null;
		organization_id: string;
	};
	const territoriesWithBrand = ((territoriesResult.data ?? []) as TerritoryRow[]).map((t) => ({
		id: t.id,
		name: t.name,
		brand_id: t.brand_id,
		brand_name: t.brand_id ? (brandNameById[t.brand_id] ?? null) : null
	}));

	return {
		members: members ?? [],
		invitations: invResult.data ?? [],
		brands: brandsResult.data ?? [],
		connectedBrands,
		memberBrandCommissions: commissionsResult.data ?? [],
		scopedMemberIds: Array.from(scopedMemberIds),
		memberEmails: emailMap,
		eligibleManagers,
		territories: territoriesWithBrand,
		isBrandOrg,
		isAdmin
	};
};
