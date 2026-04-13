import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const [territoryRes, accountsRes, allAccountsRes, membersRes] = await Promise.all([
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
			.select('id, profiles!organization_members_profile_id_fkey(display_name)')
			.eq('organization_id', organization.id)
	]);

	if (territoryRes.error || !territoryRes.data) {
		throw error(404, 'Territory not found');
	}

	return {
		territory: territoryRes.data,
		accounts: accountsRes.data ?? [],
		availableAccounts: allAccountsRes.data ?? [],
		members: membersRes.data ?? []
	};
};
