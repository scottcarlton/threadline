import {
	Client,
	type QueryDataSourceParameters,
	type BlockObjectResponse,
	type PartialBlockObjectResponse,
	type UpdatePageParameters
} from '@notionhq/client';

type NotionPropertyMap = UpdatePageParameters['properties'];
import { NOTION_CLIENT_ID, NOTION_CLIENT_SECRET } from '$env/static/private';
import { supabaseAdmin } from '../supabase.js';
import type { IntegrationConnection } from '$lib/types/database.js';

const REDIRECT_URI = '/api/integrations/notion/callback';

export function getAuthUrl(origin: string, state: string): string {
	const params = new URLSearchParams({
		client_id: NOTION_CLIENT_ID,
		redirect_uri: `${origin}${REDIRECT_URI}`,
		response_type: 'code',
		owner: 'user',
		state
	});
	return `https://api.notion.com/v1/oauth/authorize?${params}`;
}

export async function exchangeCode(
	origin: string,
	code: string
): Promise<{
	accessToken: string;
	workspaceId: string;
	workspaceName: string;
	botId: string;
}> {
	const credentials = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64');

	const res = await fetch('https://api.notion.com/v1/oauth/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Basic ${credentials}`
		},
		body: JSON.stringify({
			grant_type: 'authorization_code',
			code,
			redirect_uri: `${origin}${REDIRECT_URI}`
		})
	});

	const data = (await res.json()) as {
		error?: string;
		access_token?: string;
		workspace_id?: string;
		workspace_name?: string;
		bot_id?: string;
	};

	if (data.error) {
		throw new Error(`Notion OAuth error: ${data.error}`);
	}

	return {
		accessToken: data.access_token ?? '',
		workspaceId: data.workspace_id ?? '',
		workspaceName: data.workspace_name ?? '',
		botId: data.bot_id ?? ''
	};
}

async function getNotionClient(
	organizationId: string
): Promise<{ client: Client; connection: IntegrationConnection } | null> {
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('*')
		.eq('organization_id', organizationId)
		.eq('provider', 'notion')
		.eq('status', 'active')
		.single();

	if (!connection) return null;

	const client = new Client({ auth: connection.access_token });
	return { client, connection: connection as IntegrationConnection };
}

export async function listDatabases(
	organizationId: string
): Promise<{ id: string; title: string }[]> {
	const result = await getNotionClient(organizationId);
	if (!result) return [];

	const response = await result.client.search({
		filter: { value: 'data_source', property: 'object' },
		sort: { direction: 'descending', timestamp: 'last_edited_time' }
	});

	type SearchResult = (typeof response.results)[number];
	type WithTitle = SearchResult & { title?: Array<{ plain_text?: string }> };
	return response.results.map((db) => ({
		id: db.id,
		title: (db as WithTitle).title?.[0]?.plain_text ?? 'Untitled'
	}));
}

// Push data to a Notion database
export async function syncToNotion(
	organizationId: string,
	databaseId: string,
	rows: NotionRow[]
): Promise<{ created: number; updated: number }> {
	const result = await getNotionClient(organizationId);
	if (!result) return { created: 0, updated: 0 };

	let created = 0;
	let updated = 0;

	for (const row of rows) {
		// Check if page with this external ID already exists
		if (row.externalId) {
			const existing = await result.client.dataSources.query({
				database_id: databaseId,
				filter: {
					property: 'External ID',
					rich_text: { equals: row.externalId }
				},
				page_size: 1
			} as unknown as QueryDataSourceParameters);

			if (existing.results.length > 0) {
				await result.client.pages.update({
					page_id: existing.results[0].id,
					properties: row.properties
				});
				updated++;
				continue;
			}
		}

		await result.client.pages.create({
			parent: { database_id: databaseId },
			properties: row.properties
		});
		created++;
	}

	return { created, updated };
}

// Pull pages from a Notion database
export async function pullFromNotion(
	organizationId: string,
	databaseId: string,
	pageSize = 100
): Promise<NotionPage[]> {
	const result = await getNotionClient(organizationId);
	if (!result) return [];

	const response = await result.client.dataSources.query({
		database_id: databaseId,
		page_size: pageSize,
		sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
	} as unknown as QueryDataSourceParameters);

	type PageLike = {
		id: string;
		properties?: Record<string, unknown>;
		url?: string;
		last_edited_time?: string;
		created_time?: string;
	};
	return response.results.map((page) => {
		const p = page as PageLike;
		return {
			id: p.id,
			properties: (p.properties ?? {}) as Record<string, unknown>,
			url: p.url ?? '',
			lastEdited: p.last_edited_time ?? '',
			createdTime: p.created_time ?? ''
		};
	});
}

// Get a single page's content (blocks)
export async function getPageContent(
	organizationId: string,
	pageId: string
): Promise<Array<BlockObjectResponse | PartialBlockObjectResponse>> {
	const result = await getNotionClient(organizationId);
	if (!result) return [];

	const response = await result.client.blocks.children.list({
		block_id: pageId,
		page_size: 100
	});

	return response.results;
}

export type NotionRow = {
	externalId?: string;
	properties: NotionPropertyMap;
};

export type NotionPage = {
	id: string;
	properties: Record<string, unknown>;
	url: string;
	lastEdited: string;
	createdTime: string;
};

// Helper to build Notion property values
export const notionProps = {
	title: (text: string) => ({ title: [{ text: { content: text } }] }),
	richText: (text: string) => ({ rich_text: [{ text: { content: text } }] }),
	number: (n: number) => ({ number: n }),
	select: (name: string) => ({ select: { name } }),
	url: (url: string) => ({ url }),
	email: (email: string) => ({ email }),
	phone: (phone: string) => ({ phone_number: phone }),
	checkbox: (checked: boolean) => ({ checkbox: checked }),
	date: (start: string, end?: string) => ({ date: { start, end: end ?? null } })
};

// Export schemas for pushing data to Notion
export type SyncDataType = 'orders' | 'accounts' | 'brands';

export function mapToNotionProperties(
	dataType: SyncDataType,
	row: Record<string, unknown> & {
		id?: string;
		order_number?: string;
		accounts?: { business_name?: string } | null;
		brands?: { name?: string } | null;
		seasons?: { name?: string } | null;
		status?: string;
		total_amount?: number;
		submitted_at?: string;
		business_name?: string;
		contact_email?: string;
		phone?: string;
		city?: string;
		state?: string;
		is_active?: boolean;
		name?: string;
		website?: string;
		commission_rate?: number;
	}
): NotionPropertyMap {
	const id = row.id ?? '';
	switch (dataType) {
		case 'orders':
			return {
				Name: notionProps.title(row.order_number ?? ''),
				'External ID': notionProps.richText(id),
				Account: notionProps.richText(row.accounts?.business_name ?? ''),
				Brand: notionProps.richText(row.brands?.name ?? ''),
				Season: notionProps.richText(row.seasons?.name ?? ''),
				Status: notionProps.select(row.status ?? 'draft'),
				Total: notionProps.number(row.total_amount ?? 0),
				...(row.submitted_at ? { Submitted: notionProps.date(row.submitted_at) } : {})
			} as NotionPropertyMap;
		case 'accounts':
			return {
				Name: notionProps.title(row.business_name ?? ''),
				'External ID': notionProps.richText(id),
				...(row.contact_email ? { Email: notionProps.email(row.contact_email) } : {}),
				...(row.phone ? { Phone: notionProps.phone(row.phone) } : {}),
				...(row.city ? { City: notionProps.richText(row.city) } : {}),
				...(row.state ? { State: notionProps.richText(row.state) } : {}),
				Active: notionProps.checkbox(row.is_active ?? true)
			} as NotionPropertyMap;
		case 'brands':
			return {
				Name: notionProps.title(row.name ?? ''),
				'External ID': notionProps.richText(id),
				...(row.contact_email ? { Email: notionProps.email(row.contact_email) } : {}),
				...(row.website ? { Website: notionProps.url(row.website) } : {}),
				'Commission Rate': notionProps.number(row.commission_rate ?? 0),
				Active: notionProps.checkbox(row.is_active ?? true)
			} as NotionPropertyMap;
	}
}
