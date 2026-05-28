import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const VALID_PROVIDERS = ['google_sheets', 'slack', 'notion', 'microsoft'];

export const load: PageServerLoad = async ({ params, locals }) => {
	const provider = params.provider;

	if (!VALID_PROVIDERS.includes(provider)) {
		throw error(404, 'Integration not found');
	}

	const orgId = locals.organization!.id;

	const { data: connection } = await locals.supabase
		.from('integration_connections')
		.select('*')
		.eq('organization_id', orgId)
		.eq('provider', provider)
		.single();

	if (!connection || connection.status !== 'active') {
		throw redirect(303, '/organization/integrations');
	}

	const { data: syncLogs } = await locals.supabase
		.from('integration_sync_log')
		.select('*')
		.eq('connection_id', connection.id)
		.order('created_at', { ascending: false })
		.limit(20);

	return {
		connection,
		syncLogs: syncLogs ?? [],
		provider
	};
};
