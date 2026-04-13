import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	exportToSheet,
	EXPORT_SCHEMAS,
	type ExportDataType
} from '$lib/server/integrations/google-sheets';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const { dataType, spreadsheetId, filters } = body as {
		dataType: ExportDataType;
		spreadsheetId?: string;
		filters?: Record<string, string>;
	};

	const schema = EXPORT_SCHEMAS[dataType];
	if (!schema) {
		return json({ error: 'Invalid data type' }, { status: 400 });
	}

	const orgId = locals.organization!.id;

	// Fetch data
	let query = locals.supabase.from(schema.query).select(schema.select).eq('organization_id', orgId);

	if (filters) {
		for (const [key, value] of Object.entries(filters)) {
			if (value) query = query.eq(key, value);
		}
	}

	const { data, error: queryError } = await query.order('created_at', { ascending: false });

	if (queryError) {
		return json({ error: 'Failed to fetch data' }, { status: 500 });
	}

	if (!data?.length) {
		return json({ error: 'No data to export' }, { status: 400 });
	}

	const rows = data.map(schema.mapRow);
	const title = `${dataType.charAt(0).toUpperCase() + dataType.slice(1)} Export ${new Date().toLocaleDateString()}`;

	const result = await exportToSheet(orgId, url.origin, {
		spreadsheetId,
		title,
		headers: schema.headers,
		rows
	});

	if (!result) {
		return json({ error: 'Google Sheets not connected' }, { status: 400 });
	}

	// Get connection ID for sync log
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('id')
		.eq('organization_id', orgId)
		.eq('provider', 'google_sheets')
		.single();

	if (connection) {
		await supabaseAdmin.from('integration_sync_log').insert({
			organization_id: orgId,
			connection_id: connection.id,
			action: `export_${dataType}`,
			status: 'success',
			details: {
				spreadsheet_id: result.spreadsheetId,
				spreadsheet_url: result.spreadsheetUrl,
				row_count: result.rowCount,
				sheet_name: title
			},
			triggered_by: locals.user.id
		});
	}

	return json({
		success: true,
		spreadsheetUrl: result.spreadsheetUrl,
		rowCount: result.rowCount
	});
};
