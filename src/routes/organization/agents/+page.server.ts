import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	if (!organization) return { agents: [] };

	const { data: agents } = await supabase
		.from('org_agents')
		.select('*, profiles!org_agents_created_by_fkey(display_name)')
		.eq('organization_id', organization.id)
		.order('created_at', { ascending: false });

	return {
		agents: agents ?? []
	};
};
