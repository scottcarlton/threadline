import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const [territoryRes, accountsRes, allAccountsRes, membersRes, assigneesRes] = await Promise.all([
		supabase.from('territories').select('*').eq('id', params.id).single(),
		supabase
			.from('accounts')
			.select('id, business_name, city, state, contact_first_name, contact_last_name')
			.eq('territory_id', params.id)
			.order('business_name'),
		supabase
			.from('accounts')
			.select('id, business_name, city, state')
			.eq('organization_id', organization.id)
			.is('territory_id', null)
			.eq('is_active', true)
			.order('business_name'),
		supabase
			.from('organization_members')
			.select('id, role, profiles!organization_members_profile_id_fkey(display_name)')
			.eq('organization_id', organization.id),
		supabase
			.from('member_territories')
			.select('organization_member_id')
			.eq('territory_id', params.id)
	]);

	if (territoryRes.error || !territoryRes.data) {
		throw error(404, 'Territory not found');
	}

	const assignedMemberIds = (assigneesRes.data ?? []).map(
		(r: { organization_member_id: string }) => r.organization_member_id
	);

	// Brand label for the territory's brand_id (own or connected).
	let brandName: string | null = null;
	if (territoryRes.data.brand_id) {
		const { data: brand } = await supabase
			.from('brands')
			.select('name')
			.eq('id', territoryRes.data.brand_id)
			.maybeSingle();
		brandName = brand?.name ?? null;
	}

	return {
		territory: territoryRes.data,
		accounts: accountsRes.data ?? [],
		availableAccounts: allAccountsRes.data ?? [],
		members: membersRes.data ?? [],
		assignedMemberIds,
		brandName,
		ownOrgId: organization.id
	};
};
