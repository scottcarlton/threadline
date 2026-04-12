import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportToExcel } from '$lib/server/integrations/microsoft/excel';
import { EXPORT_SCHEMAS, type ExportDataType } from '$lib/server/integrations/google-sheets';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!locals.membership || !['admin', 'owner'].includes(locals.membership.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const { dataType } = body as { dataType: ExportDataType };

	const schema = EXPORT_SCHEMAS[dataType];
	if (!schema) {
		return json({ error: 'Invalid data type' }, { status: 400 });
	}

	const orgId = locals.organization!.id;

	const { data, error: queryError } = await locals.supabase
		.from(schema.query)
		.select(schema.select)
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false });

	if (queryError || !data?.length) {
		return json({ error: queryError ? 'Failed to fetch data' : 'No data to export' }, { status: 400 });
	}

	const rows = data.map(schema.mapRow);
	const fileName = `Threadline ${dataType.charAt(0).toUpperCase() + dataType.slice(1)} ${new Date().toLocaleDateString().replace(/\//g, '-')}`;

	const result = await exportToExcel(orgId, {
		fileName,
		sheetName: dataType.charAt(0).toUpperCase() + dataType.slice(1),
		headers: schema.headers,
		rows
	});

	if (!result) {
		return json({ error: 'Microsoft 365 not connected' }, { status: 400 });
	}

	// Log the sync
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('id')
		.eq('organization_id', orgId)
		.eq('provider', 'microsoft')
		.single();

	if (connection) {
		await supabaseAdmin.from('integration_sync_log').insert({
			organization_id: orgId,
			connection_id: connection.id,
			action: `export_excel_${dataType}`,
			status: 'success',
			details: {
				web_url: result.webUrl,
				row_count: result.rowCount,
				file_name: fileName
			},
			triggered_by: locals.user.id
		});
	}

	return json({
		success: true,
		webUrl: result.webUrl,
		rowCount: result.rowCount
	});
};
