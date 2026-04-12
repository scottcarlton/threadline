import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { executeToolCall } from '$lib/server/ai-tools.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const _toolDefinitions: Anthropic.Tool[] = [
	{
		name: 'create_brand',
		description: 'Create a new brand in the system.',
		input_schema: {
			type: 'object' as const,
			properties: {
				name: { type: 'string', description: 'Brand name (required)' },
				contact_first_name: { type: 'string', description: 'Primary contact first name' },
				contact_last_name: { type: 'string', description: 'Primary contact last name' },
				contact_email: { type: 'string', description: 'Contact email address' },
				contact_phone: { type: 'string', description: 'Contact phone number' },
				website: { type: 'string', description: 'Brand website URL' },
				notes: { type: 'string', description: 'Additional notes' }
			},
			required: ['name']
		}
	},
	{
		name: 'update_brand',
		description: 'Update an existing brand. Provide the brand_id and any fields to change.',
		input_schema: {
			type: 'object' as const,
			properties: {
				brand_id: { type: 'string', description: 'ID of the brand to update (required)' },
				name: { type: 'string', description: 'New brand name' },
				contact_first_name: { type: 'string', description: 'New contact first name' },
				contact_last_name: { type: 'string', description: 'New contact last name' },
				contact_email: { type: 'string', description: 'New contact email' },
				contact_phone: { type: 'string', description: 'New contact phone' },
				website: { type: 'string', description: 'New website URL' },
				notes: { type: 'string', description: 'New notes' }
			},
			required: ['brand_id']
		}
	},
	{
		name: 'create_account',
		description: 'Create a new wholesale account (retail buyer/store).',
		input_schema: {
			type: 'object' as const,
			properties: {
				business_name: { type: 'string', description: 'Business name (required)' },
				contact_first_name: { type: 'string', description: 'Contact person first name' },
				contact_last_name: { type: 'string', description: 'Contact person last name' },
				contact_email: { type: 'string', description: 'Contact email' },
				phone: { type: 'string', description: 'Phone number' },
				address_line1: { type: 'string', description: 'Street address' },
				city: { type: 'string', description: 'City' },
				state: { type: 'string', description: 'State' },
				zip: { type: 'string', description: 'ZIP code' },
				notes: { type: 'string', description: 'Additional notes' }
			},
			required: ['business_name']
		}
	},
	{
		name: 'update_account',
		description: 'Update an existing account. Provide the account_id and any fields to change.',
		input_schema: {
			type: 'object' as const,
			properties: {
				account_id: { type: 'string', description: 'ID of the account to update (required)' },
				business_name: { type: 'string', description: 'New business name' },
				contact_first_name: { type: 'string', description: 'New contact first name' },
				contact_last_name: { type: 'string', description: 'New contact last name' },
				contact_email: { type: 'string', description: 'New contact email' },
				phone: { type: 'string', description: 'New phone' },
				address_line1: { type: 'string', description: 'New address' },
				city: { type: 'string', description: 'New city' },
				state: { type: 'string', description: 'New state' },
				zip: { type: 'string', description: 'New zip' },
				notes: { type: 'string', description: 'New notes' }
			},
			required: ['account_id']
		}
	},
	{
		name: 'create_order',
		description:
			'Create a new wholesale order. Uses fuzzy matching to find the account and brand by name.',
		input_schema: {
			type: 'object' as const,
			properties: {
				account_name: {
					type: 'string',
					description: 'Account business name to fuzzy match (required)'
				},
				brand_name: {
					type: 'string',
					description: 'Brand name to fuzzy match (required)'
				},
				season_name: {
					type: 'string',
					description: 'Season name (e.g. "Fall", "Spring")'
				},
				order_year: {
					type: 'number',
					description: 'Order year (e.g. 2026)'
				},
				show_name: {
					type: 'string',
					description: 'Show name to associate with'
				},
				notes: { type: 'string', description: 'Order notes' }
			},
			required: ['account_name', 'brand_name']
		}
	},
	{
		name: 'add_order_lines',
		description: 'Add line items to an existing order.',
		input_schema: {
			type: 'object' as const,
			properties: {
				order_id: { type: 'string', description: 'Order ID (required)' },
				lines: {
					type: 'array',
					description: 'Array of line items',
					items: {
						type: 'object',
						properties: {
							style_number: { type: 'string' },
							description: { type: 'string' },
							color: { type: 'string' },
							size: { type: 'string' },
							qty: { type: 'number' },
							unit_price: { type: 'number' }
						},
						required: ['qty', 'unit_price']
					}
				}
			},
			required: ['order_id', 'lines']
		}
	},
	{
		name: 'update_order_status',
		description: 'Update the status of an order.',
		input_schema: {
			type: 'object' as const,
			properties: {
				order_id: { type: 'string', description: 'Order ID (required)' },
				status: {
					type: 'string',
					enum: ['draft', 'submitted', 'confirmed', 'shipped', 'delivered', 'cancelled'],
					description: 'New order status (required)'
				}
			},
			required: ['order_id', 'status']
		}
	},
	{
		name: 'create_season',
		description: 'Create a new season (e.g. "Fall", "Spring", "Resort").',
		input_schema: {
			type: 'object' as const,
			properties: {
				name: { type: 'string', description: 'Season name (required)' },
				sort_order: { type: 'number', description: 'Sort order for display' }
			},
			required: ['name']
		}
	},
	{
		name: 'create_show',
		description: 'Create a new trade show or market event.',
		input_schema: {
			type: 'object' as const,
			properties: {
				name: { type: 'string', description: 'Show name (required)' },
				venue: { type: 'string', description: 'Venue name' },
				city: { type: 'string', description: 'City' },
				state: { type: 'string', description: 'State' },
				start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
				end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
				season_name: { type: 'string', description: 'Season to associate (fuzzy match)' },
				year: { type: 'number', description: 'Year of the show' }
			},
			required: ['name']
		}
	},
	{
		name: 'query_data',
		description:
			'Query and search data. Supports brands, accounts, orders, shows, and seasons with optional filters.',
		input_schema: {
			type: 'object' as const,
			properties: {
				entity: {
					type: 'string',
					enum: ['brands', 'accounts', 'orders', 'shows', 'seasons'],
					description: 'Entity type to query (required)'
				},
				filters: {
					type: 'object',
					description:
						'Key-value filters. String values use fuzzy matching (ilike). Use field names from the database schema.',
					additionalProperties: true
				}
			},
			required: ['entity']
		}
	},
	{
		name: 'get_dashboard_metrics',
		description: 'Get aggregated dashboard metrics: order counts, revenue, status breakdowns.',
		input_schema: {
			type: 'object' as const,
			properties: {
				date_range: {
					type: 'string',
					description: 'Optional date range filter (not yet implemented)'
				},
				brand_id: { type: 'string', description: 'Filter by specific brand ID' },
				season_name: { type: 'string', description: 'Filter by season name (fuzzy match)' },
				order_year: { type: 'number', description: 'Filter by order year' }
			},
			required: []
		}
	},
	{
		name: 'draft_email',
		description:
			'Draft an email to a contact. Provide the recipient (email address or account/brand name to look up), subject, and body. The draft will be shown to the user for confirmation before sending.',
		input_schema: {
			type: 'object' as const,
			properties: {
				to: { type: 'string', description: 'Recipient email address, or account/brand name to look up contact email' },
				subject: { type: 'string', description: 'Email subject line' },
				body: { type: 'string', description: 'Email body text' },
				related_type: { type: 'string', description: 'Related entity type: account, brand, or order' },
				related_id: { type: 'string', description: 'Related entity ID' }
			},
			required: ['to', 'subject', 'body']
		}
	},
	{
		name: 'send_email',
		description:
			'Send an email via the user\'s connected Gmail account. Only call this after the user has confirmed a draft. Requires Gmail to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {
				to: { type: 'string', description: 'Recipient email address' },
				subject: { type: 'string', description: 'Email subject line' },
				body: { type: 'string', description: 'Email body text' },
				related_type: { type: 'string', description: 'Related entity type: account, brand, or order' },
				related_id: { type: 'string', description: 'Related entity ID' }
			},
			required: ['to', 'subject', 'body']
		}
	},
	{
		name: 'search_emails',
		description: 'Search the user\'s Gmail inbox for emails. Requires Gmail to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {
				query: { type: 'string', description: 'Search query (Gmail search syntax)' },
				from: { type: 'string', description: 'Filter by sender email' },
				to: { type: 'string', description: 'Filter by recipient email' }
			},
			required: []
		}
	},
	{
		name: 'create_territory',
		description: 'Create a new geographic territory for organizing accounts and assigning reps.',
		input_schema: {
			type: 'object' as const,
			properties: {
				name: { type: 'string', description: 'Territory name (required), e.g. "West Coast", "Southeast"' },
				assigned_to_name: { type: 'string', description: 'Name of the team member to assign (fuzzy match)' },
				notes: { type: 'string', description: 'Optional notes' }
			},
			required: ['name']
		}
	},
	{
		name: 'update_territory',
		description: 'Update an existing territory.',
		input_schema: {
			type: 'object' as const,
			properties: {
				territory_id: { type: 'string', description: 'Territory ID (required)' },
				name: { type: 'string', description: 'New name' },
				assigned_to_name: { type: 'string', description: 'New assigned rep name (fuzzy match), or empty to unassign' },
				notes: { type: 'string', description: 'New notes' }
			},
			required: ['territory_id']
		}
	},
	{
		name: 'assign_account_territory',
		description: 'Assign an account to a territory, or remove from territory.',
		input_schema: {
			type: 'object' as const,
			properties: {
				account_name: { type: 'string', description: 'Account business name (fuzzy match, required)' },
				territory_name: { type: 'string', description: 'Territory name (fuzzy match). Leave empty to remove from territory.' }
			},
			required: ['account_name']
		}
	},
	{
		name: 'create_appointment',
		description: 'Schedule an appointment with an account. Can be at a show, on the road, by phone, video, or other.',
		input_schema: {
			type: 'object' as const,
			properties: {
				account_name: { type: 'string', description: 'Account business name (fuzzy match, required)' },
				location_type: { type: 'string', enum: ['show', 'road', 'phone', 'video', 'other'], description: 'Type of appointment location (required)' },
				location_detail: { type: 'string', description: 'Address, phone number, meeting link, or other details' },
				show_name: { type: 'string', description: 'Show name (fuzzy match) — only when location_type is "show"' },
				scheduled_date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
				scheduled_time: { type: 'string', description: 'Time (HH:MM, 24h format)' },
				duration_minutes: { type: 'number', description: 'Duration in minutes (default 30)' },
				notes: { type: 'string', description: 'Notes' }
			},
			required: ['account_name', 'location_type']
		}
	},
	{
		name: 'update_appointment',
		description: 'Update an appointment — change status, reschedule, or add notes.',
		input_schema: {
			type: 'object' as const,
			properties: {
				appointment_id: { type: 'string', description: 'Appointment ID (required)' },
				status: { type: 'string', enum: ['scheduled', 'completed', 'cancelled', 'no_show'], description: 'New status' },
				scheduled_date: { type: 'string', description: 'New date (YYYY-MM-DD)' },
				scheduled_time: { type: 'string', description: 'New time (HH:MM)' },
				duration_minutes: { type: 'number', description: 'New duration' },
				notes: { type: 'string', description: 'New notes' }
			},
			required: ['appointment_id']
		}
	},
	{
		name: 'delete_appointment',
		description: 'Delete an appointment.',
		input_schema: {
			type: 'object' as const,
			properties: {
				appointment_id: { type: 'string', description: 'Appointment ID (required)' }
			},
			required: ['appointment_id']
		}
	},
	{
		name: 'update_order_line',
		description: 'Update the quantity of an order line item (increase or decrease).',
		input_schema: {
			type: 'object' as const,
			properties: {
				line_id: { type: 'string', description: 'Order line ID (required)' },
				qty: { type: 'number', description: 'New quantity (required, must be >= 1)' }
			},
			required: ['line_id', 'qty']
		}
	},
	{
		name: 'remove_order_line',
		description: 'Remove a line item from an order with a reason.',
		input_schema: {
			type: 'object' as const,
			properties: {
				line_id: { type: 'string', description: 'Order line ID (required)' },
				reason: { type: 'string', description: 'Reason for removal (required)' }
			},
			required: ['line_id', 'reason']
		}
	},
	{
		name: 'update_order',
		description: 'Update order details: notes, expected ship date, or cancellation reason.',
		input_schema: {
			type: 'object' as const,
			properties: {
				order_id: { type: 'string', description: 'Order ID (required)' },
				notes: { type: 'string', description: 'Order notes' },
				expected_ship_date: { type: 'string', description: 'Expected ship date (YYYY-MM-DD)' },
				cancelled_reason: { type: 'string', description: 'Reason for cancellation' }
			},
			required: ['order_id']
		}
	},
	{
		name: 'archive_entity',
		description: 'Archive or unarchive a brand or account.',
		input_schema: {
			type: 'object' as const,
			properties: {
				entity_type: { type: 'string', enum: ['brand', 'account'], description: 'Type of entity (required)' },
				entity_id: { type: 'string', description: 'Entity ID (required)' },
				action: { type: 'string', enum: ['archive', 'unarchive'], description: 'Archive or unarchive (required)' }
			},
			required: ['entity_type', 'entity_id', 'action']
		}
	},
	{
		name: 'get_sales_report',
		description: 'Get a sales report grouped by brand, account, territory, or rep. Returns order counts, revenue, and averages.',
		input_schema: {
			type: 'object' as const,
			properties: {
				group_by: { type: 'string', enum: ['brand', 'account', 'territory', 'rep'], description: 'How to group the data (required)' },
				order_year: { type: 'number', description: 'Filter by year' },
				season_name: { type: 'string', description: 'Filter by season (fuzzy match)' }
			},
			required: ['group_by']
		}
	},
	{
		name: 'get_style_velocity',
		description: 'Get trending/hot-selling styles. Shows which styles are being ordered by the most accounts in a given time window. Useful for identifying demand signals and trending products.',
		input_schema: {
			type: 'object' as const,
			properties: {
				days: { type: 'number', description: 'Time window in days (default 14). Common values: 7, 14, 30.' },
				brand_name: { type: 'string', description: 'Filter by brand name (fuzzy match)' },
				min_accounts: { type: 'number', description: 'Minimum number of accounts to qualify as trending (default 2)' },
				limit: { type: 'number', description: 'Max results to return (default 20)' }
			},
			required: []
		}
	},
	{
		name: 'get_commission_report',
		description: 'Get commission breakdown showing brand commission rates, rep commission rates, and earned amounts.',
		input_schema: {
			type: 'object' as const,
			properties: {
				order_year: { type: 'number', description: 'Filter by year' },
				brand_name: { type: 'string', description: 'Filter by brand (fuzzy match)' },
				rep_name: { type: 'string', description: 'Filter by rep name (fuzzy match)' }
			},
			required: []
		}
	},
	{
		name: 'get_account_health',
		description: 'Get account health scores. Shows which accounts are thriving, at risk, or need attention. Can filter by health label.',
		input_schema: {
			type: 'object' as const,
			properties: {
				filter: { type: 'string', enum: ['excellent', 'good', 'fair', 'at_risk', 'inactive', 'new'], description: 'Filter by health label. Omit to see all.' },
				limit: { type: 'number', description: 'Max results (default 20)' }
			},
			required: []
		}
	},
	{
		name: 'add_product',
		description: 'Add a product to a brand\'s catalog.',
		input_schema: {
			type: 'object' as const,
			properties: {
				brand_name: { type: 'string', description: 'Brand name (fuzzy match, required)' },
				style_number: { type: 'string', description: 'Style number (required)' },
				name: { type: 'string', description: 'Product name (required)' },
				wholesale_price: { type: 'number', description: 'Wholesale price (required)' },
				retail_price: { type: 'number', description: 'Retail price' },
				category: { type: 'string', description: 'Category (e.g. Tops, Bottoms, Dresses)' },
				description: { type: 'string', description: 'Product description' },
				season_name: { type: 'string', description: 'Season name (fuzzy match)' }
			},
			required: ['brand_name', 'style_number', 'name', 'wholesale_price']
		}
	},
	{
		name: 'send_slack_message',
		description: 'Send a notification message to the connected Slack channel. Requires Slack to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {
				title: { type: 'string', description: 'Message title/headline (required)' },
				text: { type: 'string', description: 'Message body text (required)' },
				url: { type: 'string', description: 'Optional link URL to include' },
				color: { type: 'string', description: 'Hex color for the message sidebar (e.g. "#36a64f")' }
			},
			required: ['title', 'text']
		}
	},
	{
		name: 'send_discord_message',
		description: 'Send a notification message to the connected Discord channel. Requires Discord to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {
				title: { type: 'string', description: 'Message title/headline (required)' },
				text: { type: 'string', description: 'Message body text (required)' },
				url: { type: 'string', description: 'Optional link URL to include' },
				color: { type: 'string', description: 'Hex color for the embed (e.g. "#7289da")' }
			},
			required: ['title', 'text']
		}
	},
	{
		name: 'export_to_google_sheet',
		description: 'Export data (orders, accounts, or brands) to a Google Sheets spreadsheet. Creates a new spreadsheet or adds a tab to an existing one. Requires Google Sheets to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {
				data_type: { type: 'string', enum: ['orders', 'accounts', 'brands'], description: 'Type of data to export (required)' },
				title: { type: 'string', description: 'Sheet/tab title (defaults to data type + date)' },
				spreadsheet_id: { type: 'string', description: 'Existing spreadsheet ID to add a tab to. Omit to create new.' }
			},
			required: ['data_type']
		}
	},
	{
		name: 'list_notion_databases',
		description: 'List available Notion databases in the connected workspace. Requires Notion to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'sync_to_notion',
		description: 'Sync data (orders, accounts, or brands) to a Notion database. Creates or updates pages. Requires Notion to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {
				data_type: { type: 'string', enum: ['orders', 'accounts', 'brands'], description: 'Type of data to sync (required)' },
				database_id: { type: 'string', description: 'Notion database ID to sync to (required). Use list_notion_databases to find available databases.' }
			},
			required: ['data_type', 'database_id']
		}
	},
	{
		name: 'pull_from_notion',
		description: 'Pull pages from a Notion database. Returns page data including properties. Requires Notion to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {
				database_id: { type: 'string', description: 'Notion database ID to pull from (required)' },
				page_size: { type: 'number', description: 'Max pages to return (default 100)' }
			},
			required: ['database_id']
		}
	}
];

const WRITE_TOOLS = new Set([
	'send_email',
	'create_brand',
	'update_brand',
	'create_account',
	'update_account',
	'create_order',
	'add_order_lines',
	'update_order_status',
	'update_order',
	'update_order_line',
	'remove_order_line',
	'create_season',
	'create_show',
	'create_territory',
	'update_territory',
	'assign_account_territory',
	'create_appointment',
	'update_appointment',
	'delete_appointment',
	'archive_entity',
	'add_product',
	'send_slack_message',
	'send_discord_message',
	'export_to_google_sheet',
	'sync_to_notion'
]);

function describeCurrentPage(path: string): string {
	if (path === '/') return 'Home'; if (path === '/dashboard') return 'Buyer dashboard';
	if (path === '/brands') return 'Brands list';
	if (path.match(/^\/brands\/[^/]+\/products\/new/)) return 'Creating a new product';
	if (path.match(/^\/brands\/[^/]+\/products\/[^/]+/)) return 'Viewing a product detail page';
	if (path.match(/^\/brands\/[^/]+\/products/)) return 'Product catalog for a brand';
	if (path.match(/^\/brands\/new/)) return 'Creating a new brand';
	if (path.match(/^\/brands\/[^/]+/)) return 'Viewing a brand detail page';
	if (path === '/accounts') return 'Accounts list';
	if (path.match(/^\/accounts\/new/)) return 'Creating a new account';
	if (path.match(/^\/accounts\/[^/]+/)) return 'Viewing an account detail page';
	if (path === '/orders') return 'Orders list';
	if (path.match(/^\/orders\/new/)) return 'Creating a new order';
	if (path.match(/^\/orders\/[^/]+/)) return 'Viewing an order detail page';
	if (path === '/inbox') return 'Email inbox';
	if (path === '/insight' || path === '/reports') return 'Reports and insights';
	if (path === '/appointments') return 'Appointments calendar';
	if (path.match(/^\/settings/)) return 'Settings';
	if (path.match(/^\/organization/)) return 'Organization settings';
	return path;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { message, files, conversationHistory, currentPage, entityContext: entityCtx, agentId } = await request.json();
	const origin = request.headers.get('origin') || new URL(request.url).origin;
	const requestStartTime = Date.now();

	if (!message || typeof message !== 'string') {
		return json({ error: 'Message is required' }, { status: 400 });
	}

	// Resolve agent — by explicit agentId or @slug mention
	let agentPrompt: string | null = null;
	let resolvedAgentId: string | null = agentId ?? null;
	let cleanMessage = message;

	const slugMatch = message.match(/^@([\w-]+)\s*/);
	if (slugMatch && !resolvedAgentId) {
		const { data: agentBySlug } = await locals.supabase
			.from('org_agents')
			.select('id, system_prompt')
			.eq('organization_id', locals.organization.id)
			.eq('slug', slugMatch[1])
			.eq('is_active', true)
			.single();
		if (agentBySlug) {
			resolvedAgentId = agentBySlug.id;
			agentPrompt = agentBySlug.system_prompt;
			cleanMessage = message.slice(slugMatch[0].length);
		}
	}

	if (resolvedAgentId && !agentPrompt) {
		const { data: agentById } = await locals.supabase
			.from('org_agents')
			.select('system_prompt')
			.eq('id', resolvedAgentId)
			.eq('is_active', true)
			.single();
		if (agentById) {
			agentPrompt = agentById.system_prompt;
		}
	}

	// Build multimodal user content if files are attached
	type FilePayload = { name: string; type: string; data: string };
	let userContent: string | Anthropic.ContentBlockParam[];
	if (files && Array.isArray(files) && files.length > 0) {
		const contentBlocks: Anthropic.ContentBlockParam[] = [];
		for (const file of files as FilePayload[]) {
			if (file.type.startsWith('image/')) {
				const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
				contentBlocks.push({
					type: 'image',
					source: { type: 'base64', media_type: mediaType, data: file.data }
				});
			} else {
				// For non-image files, decode base64 and include as text context
				const decoded = Buffer.from(file.data, 'base64').toString('utf-8');
				contentBlocks.push({
					type: 'text',
					text: `[Attached file: ${file.name}]\n${decoded}`
				});
			}
		}
		contentBlocks.push({ type: 'text', text: cleanMessage });
		userContent = contentBlocks;
	} else {
		userContent = cleanMessage;
	}

	const role = locals.membership?.role ?? 'guest';
	const brandScopeInfo = locals.brandScope
		? `You are scoped to specific brands only. Only interact with data for your assigned brands.`
		: 'You have access to all brands in the organization.';

	const pageContext = describeCurrentPage(currentPage ?? '/');

	// Static system instructions (cacheable — same for all users/requests)
	const staticSystem = `You are the AI assistant for Threadline, a multi-brand women's wholesale contractor portal. You help manage brands, accounts, orders, shows, seasons, territories, and appointments.

Your capabilities:
- Brands & Accounts: create, update, archive/unarchive, assign territories
- Orders: create, add/edit/remove line items, update status, set ship dates, add notes
- Shows & Seasons: create shows and seasons
- Territories: create, update, assign accounts to territories
- Appointments: schedule (show/road/phone/video), reschedule, complete, cancel, delete
- Email: draft, send (via Gmail), search inbox
- Analytics: sales reports (by brand/account/territory/rep), commission reports, dashboard metrics
- Data queries: search across brands, accounts, orders, shows, seasons, territories, appointments, contacts, order lines, show dates
- Integrations: send Slack/Discord messages, export data to Google Sheets, sync/pull data with Notion

Important rules:
1. Season + year model: "Fall 2026" means season="Fall" and order_year=2026. Always split these when creating or querying orders.
2. When referencing accounts, brands, territories, or shows by name, use fuzzy matching — users may not type exact names.
3. Always confirm what you did after performing an action.
4. Be concise and professional. This is a business tool.
5. When presenting data, format it clearly with relevant details. Use markdown formatting (bold, lists, tables) for readability.
6. If asked to do something outside your capabilities, explain what you can and cannot do.
7. After every response, include 2-3 brief suggested follow-up prompts on the very last line, formatted as: SUGGESTIONS:["prompt 1","prompt 2","prompt 3"]. These should be natural next questions or actions the user might want. Do NOT include this line inside code blocks.`;

	// Dynamic per-request context
	const entityInfo = entityCtx?.summary
		? `\n- Entity in view: ${entityCtx.summary}. The user is currently looking at this ${entityCtx.type} — use this context to answer questions without requiring them to re-specify which ${entityCtx.type} they mean.`
		: '';

	const orgTypeLabel = locals.orgType === 'brand' ? 'Brand (manufacturer)' : 'Rep (sales agency)';

	// Check setup state for new rep orgs
	let setupInfo = '';
	if (locals.orgType === 'rep') {
		const [brandCheck, productCheck, accountCheck, orderCheck] = await Promise.all([
			locals.supabase.from('brands').select('id', { count: 'exact', head: true }).eq('organization_id', locals.organization.id).eq('is_active', true),
			locals.supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', locals.organization.id).eq('is_active', true),
			locals.supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('organization_id', locals.organization.id).eq('is_active', true),
			locals.supabase.from('orders').select('id', { count: 'exact', head: true }).eq('organization_id', locals.organization.id)
		]);
		const hasBrands = (brandCheck.count ?? 0) > 0;
		const hasProducts = (productCheck.count ?? 0) > 0;
		const hasAccounts = (accountCheck.count ?? 0) > 0;
		const hasOrders = (orderCheck.count ?? 0) > 0;
		if (!hasBrands || !hasProducts || !hasAccounts || !hasOrders) {
			const missing = [];
			if (!hasBrands) missing.push('add a brand (the fashion labels they represent)');
			if (!hasProducts) missing.push('add products to a brand (their product catalog)');
			if (!hasAccounts) missing.push('create an account (retail buyers/stores they sell to)');
			if (!hasOrders) missing.push('create their first order');
			setupInfo = `\nNEW USER SETUP: This is a new workspace still being set up. The user still needs to: ${missing.join(', ')}. If they ask what to do or how to get started, guide them through these steps in order. You can help them create brands, accounts, and orders using your tools.`;
		}
	}

	const dynamicSystem = `Current user context:
- Organization: ${locals.organization.name}
- Org type: ${orgTypeLabel}
- User: ${locals.user.display_name}
- Role: ${role}
- Brand access: ${brandScopeInfo}
- Currently viewing: ${pageContext}${entityInfo}
${locals.orgType === 'brand' ? '\nThis is a BRAND organization. The user manages their own product catalog and sees orders from connected reps. Focus on products, rep performance, and order fulfillment.' : ''}${setupInfo}${role === 'guest' ? '\nIMPORTANT: This user has READ-ONLY access. Do NOT perform any create, update, or delete operations. Only use query_data, get_dashboard_metrics, get_sales_report, get_commission_report, and get_style_velocity.' : ''}`;

	// Use structured system blocks for prompt caching
	const systemBlocks: Anthropic.TextBlockParam[] = [
		{ type: 'text', text: staticSystem, cache_control: { type: 'ephemeral' } } as any,
		{ type: 'text', text: dynamicSystem }
	];

	// Inject custom agent prompt if active
	if (agentPrompt) {
		systemBlocks.push({
			type: 'text',
			text: `\n\nCUSTOM AGENT INSTRUCTIONS:\n${agentPrompt}`
		});
	}

	// Mark the last tool for caching (caches all tools up to this point)
	const cachedTools = _toolDefinitions.map((tool, i) =>
		i === _toolDefinitions.length - 1
			? { ...tool, cache_control: { type: 'ephemeral' } } as any
			: tool
	);

	try {
		const messages: Anthropic.MessageParam[] = [
			...(conversationHistory ?? []),
			{ role: 'user' as const, content: userContent }
		];

		// Pre-flight: use Haiku to classify whether this needs tools/Sonnet or can be answered directly.
		// Skip classification if files are attached (needs Sonnet vision) or a custom agent is active.
		const needsClassification = typeof userContent === 'string' && !agentPrompt;
		let useHaiku = false;

		if (needsClassification) {
			const classifyResponse = await anthropic.messages.create({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 20,
				system: [{ type: 'text', text: 'Classify whether this user message to a business assistant requires looking up or modifying data (tools), or can be answered conversationally (e.g. greetings, thanks, general knowledge, clarifying questions, opinions). Respond with exactly one word: TOOLS or CHAT' }],
				messages: [{ role: 'user', content: userContent }]
			});
			const classification = classifyResponse.content[0]?.type === 'text'
				? classifyResponse.content[0].text.trim().toUpperCase()
				: 'TOOLS';
			useHaiku = classification === 'CHAT';
		}

		if (useHaiku) {
			// Simple conversational response — Haiku without tools
			const haikuResponse = await anthropic.messages.create({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 1024,
				system: systemBlocks,
				messages
			});
			const textBlocks = haikuResponse.content.filter(
				(block): block is Anthropic.TextBlock => block.type === 'text'
			);
			let responseText = textBlocks.map((b) => b.text).join('\n');

			let suggestions: string[] | undefined;
			const lines = responseText.trimEnd().split('\n');
			const lastLine = lines[lines.length - 1];
			if (lastLine?.startsWith('SUGGESTIONS:')) {
				try {
					suggestions = JSON.parse(lastLine.slice('SUGGESTIONS:'.length));
					responseText = lines.slice(0, -1).join('\n').trimEnd();
				} catch { /* leave as-is */ }
			}

			return json({ response: responseText, suggestions });
		}

		let response = await anthropic.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 4096,
			system: systemBlocks,
			tools: cachedTools,
			messages
		});

		const actions: Array<{ tool: string; input: Record<string, unknown>; result: unknown }> = [];

		// Handle tool use loop (Claude may call multiple tools in sequence)
		while (response.stop_reason === 'tool_use') {
			const toolResults: Anthropic.ToolResultBlockParam[] = [];

			for (const block of response.content) {
				if (block.type !== 'tool_use') continue;

				const toolUse = block;

				// Check write permission
				if (WRITE_TOOLS.has(toolUse.name) && role === 'guest') {
					toolResults.push({
						type: 'tool_result',
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							success: false,
							error: 'Permission denied. Guest users have read-only access.'
						})
					});
					continue;
				}

				const toolInput = toolUse.input as Record<string, unknown>;

				// Check brand scope for brand-specific write ops
				if (
					locals.brandScope &&
					['update_brand'].includes(toolUse.name) &&
					toolInput.brand_id &&
					!locals.brandScope.includes(toolInput.brand_id as string)
				) {
					toolResults.push({
						type: 'tool_result',
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							success: false,
							error: 'Access denied. This brand is outside your scope.'
						})
					});
					continue;
				}

				const result = await executeToolCall(toolUse.name, toolInput, {
					supabase: locals.supabase,
					organizationId: locals.organization!.id,
					userId: locals.user!.id,
					brandScope: locals.brandScope,
					orgType: locals.orgType,
					origin
				});

				actions.push({ tool: toolUse.name, input: toolInput, result });

				toolResults.push({
					type: 'tool_result',
					tool_use_id: toolUse.id,
					content: JSON.stringify(result)
				});
			}

			// Send tool results back to Claude
			messages.push({ role: 'assistant' as const, content: response.content });
			messages.push({ role: 'user' as const, content: toolResults });

			response = await anthropic.messages.create({
				model: 'claude-sonnet-4-20250514',
				max_tokens: 4096,
				system: systemBlocks,
				tools: cachedTools,
				messages
			});
		}

		// Extract final text response
		const textBlocks = response.content.filter(
			(block): block is Anthropic.TextBlock => block.type === 'text'
		);
		let responseText = textBlocks.map((b) => b.text).join('\n');

		// Parse out suggestions from the last line
		let suggestions: string[] | undefined;
		const lines = responseText.trimEnd().split('\n');
		const lastLine = lines[lines.length - 1];
		if (lastLine?.startsWith('SUGGESTIONS:')) {
			try {
				suggestions = JSON.parse(lastLine.slice('SUGGESTIONS:'.length));
				responseText = lines.slice(0, -1).join('\n').trimEnd();
			} catch {
				// If parsing fails, leave response as-is
			}
		}

		// Log agent run if this was an agent invocation
		if (resolvedAgentId) {
			const toolNames = actions.map((a) => a.tool);
			await locals.supabase
				.from('org_agent_runs')
				.insert({
					agent_id: resolvedAgentId,
					organization_id: locals.organization!.id,
					triggered_by: 'user',
					input_prompt: cleanMessage,
					output_text: responseText,
					tools_used: toolNames.length > 0 ? toolNames : null,
					status: 'completed',
					completed_at: new Date().toISOString(),
					duration_ms: Date.now() - requestStartTime
				});
		}

		return json({
			response: responseText,
			actions: actions.length > 0 ? actions : undefined,
			suggestions
		});
	} catch (err) {
		console.error('AI API error:', err);
		const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
		return json({ error: errorMessage }, { status: 500 });
	}
};
