import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { data: connections } = await locals.supabase
		.from('integration_connections')
		.select('*')
		.eq('organization_id', locals.organization!.id);

	return { connections: connections ?? [] };
};
