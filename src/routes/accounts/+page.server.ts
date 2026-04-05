import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;
	if (!organization) return { accounts: [] };

	const { data: accounts } = await supabase
		.from('accounts')
		.select('*')
		.eq('organization_id', organization.id)
		.order('business_name');

	return { accounts: accounts ?? [] };
};
