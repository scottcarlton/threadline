import type { PageServerLoad } from './$types';
import type { IntegrationSyncLog } from '$lib/types/database.js';
import { latestSyncByConnection } from '$lib/utils/integration-sync';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = locals.organization!.id;

	const { data: connections } = await locals.supabase
		.from('integration_connections')
		.select('*')
		.eq('organization_id', orgId);

	// Latest sync per connection, for the "Last sync" line on each card. A
	// bounded window is enough: every connection with recent activity shows up
	// in the newest rows, and an older one just shows no line.
	const connectionIds = (connections ?? []).map((c) => c.id as string);
	let latestSync = {};
	if (connectionIds.length) {
		const { data: logs } = await locals.supabase
			.from('integration_sync_log')
			.select('connection_id, status, created_at')
			.eq('organization_id', orgId)
			.in('connection_id', connectionIds)
			.order('created_at', { ascending: false })
			.limit(200);
		latestSync = latestSyncByConnection(
			(logs ?? []) as Pick<IntegrationSyncLog, 'connection_id' | 'status' | 'created_at'>[]
		);
	}

	return { connections: connections ?? [], latestSync };
};
