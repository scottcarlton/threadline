import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	syncToNotion,
	mapToNotionProperties,
	type SyncDataType
} from '$lib/server/integrations/notion';
import { EXPORT_SCHEMAS } from '$lib/server/integrations/google-sheets';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const { dataType, databaseId } = body as {
		dataType: SyncDataType;
		databaseId: string;
	};

	if (!dataType || !databaseId) {
		return json({ error: 'Missing dataType or databaseId' }, { status: 400 });
	}

	const schema = EXPORT_SCHEMAS[dataType];
	if (!schema) {
		return json({ error: 'Invalid data type' }, { status: 400 });
	}

	const orgId = locals.organization!.id;

	// Fetch data from Supabase
	const { data, error: queryError } = await locals.supabase
		.from(schema.query)
		.select(schema.select)
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false });

	if (queryError || !data?.length) {
		return json(
			{ error: queryError ? 'Failed to fetch data' : 'No data to sync' },
			{ status: 400 }
		);
	}

	// Map to Notion properties
	const rows = (data as unknown as Array<Record<string, unknown>>).map((row) => ({
		externalId: row.id as string,
		properties: mapToNotionProperties(dataType, row)
	}));

	const result = await syncToNotion(orgId, databaseId, rows);

	// Log the sync
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('id')
		.eq('organization_id', orgId)
		.eq('provider', 'notion')
		.single();

	if (connection) {
		await supabaseAdmin.from('integration_sync_log').insert({
			organization_id: orgId,
			connection_id: connection.id,
			action: `sync_${dataType}`,
			status: 'success',
			details: {
				database_id: databaseId,
				created: result.created,
				updated: result.updated,
				total: data.length
			},
			triggered_by: locals.user.id
		});
	}

	return json({
		success: true,
		created: result.created,
		updated: result.updated
	});
};
