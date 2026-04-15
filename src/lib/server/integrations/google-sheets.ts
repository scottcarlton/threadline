import { google } from 'googleapis';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$env/static/private';
import { supabaseAdmin } from '../supabase.js';
import type { IntegrationConnection } from '$lib/types/database.js';

const SCOPES = [
	'https://www.googleapis.com/auth/spreadsheets',
	'https://www.googleapis.com/auth/drive.file',
	'https://www.googleapis.com/auth/userinfo.email'
];

const REDIRECT_URI = '/api/integrations/google-sheets/callback';

function getOAuthClient(origin: string) {
	return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${origin}${REDIRECT_URI}`);
}

export function getAuthUrl(origin: string, state: string): string {
	const client = getOAuthClient(origin);
	return client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
		prompt: 'consent',
		state
	});
}

export async function exchangeCode(origin: string, code: string) {
	const client = getOAuthClient(origin);
	const { tokens } = await client.getToken(code);
	return tokens;
}

export async function getAccountEmail(origin: string, accessToken: string): Promise<string> {
	const client = getOAuthClient(origin);
	client.setCredentials({ access_token: accessToken });
	const oauth2 = google.oauth2({ version: 'v2', auth: client });
	const { data } = await oauth2.userinfo.get();
	return data.email ?? '';
}

async function getAuthenticatedClient(connection: IntegrationConnection, origin: string) {
	const client = getOAuthClient(origin);
	client.setCredentials({
		access_token: connection.access_token,
		refresh_token: connection.refresh_token,
		expiry_date: connection.token_expires_at
			? new Date(connection.token_expires_at).getTime()
			: undefined
	});

	client.on('tokens', async (tokens) => {
		const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (tokens.access_token) updateData.access_token = tokens.access_token;
		if (tokens.expiry_date)
			updateData.token_expires_at = new Date(tokens.expiry_date).toISOString();
		if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;

		await supabaseAdmin.from('integration_connections').update(updateData).eq('id', connection.id);
	});

	return client;
}

export async function getSheetsClient(organizationId: string, origin: string) {
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('*')
		.eq('organization_id', organizationId)
		.eq('provider', 'google_sheets')
		.eq('status', 'active')
		.single();

	if (!connection) return null;

	const auth = await getAuthenticatedClient(connection as IntegrationConnection, origin);
	return {
		sheets: google.sheets({ version: 'v4', auth }),
		drive: google.drive({ version: 'v3', auth }),
		connectionId: connection.id
	};
}

export async function createSpreadsheet(
	organizationId: string,
	origin: string,
	title: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string } | null> {
	const client = await getSheetsClient(organizationId, origin);
	if (!client) return null;

	const response = await client.sheets.spreadsheets.create({
		requestBody: { properties: { title } }
	});

	return {
		spreadsheetId: response.data.spreadsheetId!,
		spreadsheetUrl: response.data.spreadsheetUrl!
	};
}

export async function exportToSheet(
	organizationId: string,
	origin: string,
	options: {
		spreadsheetId?: string;
		title: string;
		headers: string[];
		rows: (string | number | null)[][];
	}
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; rowCount: number } | null> {
	const client = await getSheetsClient(organizationId, origin);
	if (!client) return null;

	let spreadsheetId = options.spreadsheetId;
	let spreadsheetUrl: string;

	if (!spreadsheetId) {
		const created = await client.sheets.spreadsheets.create({
			requestBody: { properties: { title: options.title } }
		});
		spreadsheetId = created.data.spreadsheetId!;
		spreadsheetUrl = created.data.spreadsheetUrl!;
	} else {
		spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

		// Add a new sheet tab
		await client.sheets.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: {
				requests: [
					{
						addSheet: {
							properties: { title: options.title }
						}
					}
				]
			}
		});
	}

	// Write headers + data
	const values = [options.headers, ...options.rows];
	await client.sheets.spreadsheets.values.update({
		spreadsheetId,
		range: `'${options.title}'!A1`,
		valueInputOption: 'USER_ENTERED',
		requestBody: { values }
	});

	// Auto-resize columns and bold headers
	const sheetRes = await client.sheets.spreadsheets.get({ spreadsheetId });
	const sheet = sheetRes.data.sheets?.find((s) => s.properties?.title === options.title);
	const sheetId = sheet?.properties?.sheetId ?? 0;

	await client.sheets.spreadsheets.batchUpdate({
		spreadsheetId,
		requestBody: {
			requests: [
				{
					repeatCell: {
						range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
						cell: {
							userEnteredFormat: { textFormat: { bold: true } }
						},
						fields: 'userEnteredFormat.textFormat.bold'
					}
				},
				{
					autoResizeDimensions: {
						dimensions: { sheetId, dimension: 'COLUMNS' }
					}
				}
			]
		}
	});

	return { spreadsheetId, spreadsheetUrl, rowCount: options.rows.length };
}

export type ExportDataType = 'orders' | 'accounts' | 'brands';

export type ExportRow = Record<string, unknown>;

type OrderRow = {
	order_number?: string | null;
	accounts?: { business_name?: string | null } | { business_name?: string | null }[] | null;
	brands?: { name?: string | null } | { name?: string | null }[] | null;
	seasons?: { name?: string | null } | { name?: string | null }[] | null;
	order_year?: number | null;
	status?: string | null;
	total_amount?: number | null;
	created_at?: string | null;
	submitted_at?: string | null;
};

type AccountRow = {
	business_name?: string | null;
	contact_first_name?: string | null;
	contact_last_name?: string | null;
	contact_email?: string | null;
	phone?: string | null;
	city?: string | null;
	state?: string | null;
	country?: string | null;
	is_active?: boolean | null;
};

type BrandRow = {
	name?: string | null;
	contact_first_name?: string | null;
	contact_last_name?: string | null;
	contact_email?: string | null;
	contact_phone?: string | null;
	website?: string | null;
	commission_rate?: number | null;
	is_active?: boolean | null;
};

function firstJoin<T>(val: T | T[] | null | undefined): T | null {
	if (val == null) return null;
	return Array.isArray(val) ? (val[0] ?? null) : val;
}

export const EXPORT_SCHEMAS: Record<
	ExportDataType,
	{
		headers: string[];
		query: string;
		select: string;
		mapRow: (row: ExportRow) => (string | number | null)[];
	}
> = {
	orders: {
		headers: [
			'Order #',
			'Account',
			'Brand',
			'Season',
			'Year',
			'Status',
			'Total',
			'Created',
			'Submitted'
		],
		query: 'orders',
		select: '*, accounts(business_name), brands(name), seasons(name)',
		mapRow: (row) => {
			const o = row as OrderRow;
			return [
				o.order_number ?? '',
				firstJoin(o.accounts)?.business_name ?? '',
				firstJoin(o.brands)?.name ?? '',
				firstJoin(o.seasons)?.name ?? '',
				o.order_year ?? '',
				o.status ?? '',
				o.total_amount ?? '',
				o.created_at ? new Date(o.created_at).toLocaleDateString() : '',
				o.submitted_at ? new Date(o.submitted_at).toLocaleDateString() : ''
			];
		}
	},
	accounts: {
		headers: [
			'Business Name',
			'Contact First',
			'Contact Last',
			'Email',
			'Phone',
			'City',
			'State',
			'Country',
			'Active'
		],
		query: 'accounts',
		select: '*',
		mapRow: (row) => {
			const a = row as AccountRow;
			return [
				a.business_name ?? '',
				a.contact_first_name ?? '',
				a.contact_last_name ?? '',
				a.contact_email ?? '',
				a.phone ?? '',
				a.city ?? '',
				a.state ?? '',
				a.country ?? '',
				a.is_active ? 'Yes' : 'No'
			];
		}
	},
	brands: {
		headers: [
			'Name',
			'Contact First',
			'Contact Last',
			'Email',
			'Phone',
			'Website',
			'Commission Rate',
			'Active'
		],
		query: 'brands',
		select: '*',
		mapRow: (row) => {
			const b = row as BrandRow;
			return [
				b.name ?? '',
				b.contact_first_name ?? '',
				b.contact_last_name ?? '',
				b.contact_email ?? '',
				b.contact_phone ?? '',
				b.website ?? '',
				b.commission_rate ? `${b.commission_rate}%` : '',
				b.is_active ? 'Yes' : 'No'
			];
		}
	}
};
