import type Anthropic from '@anthropic-ai/sdk';
import { toolInputJsonSchema, toolSchemas, type ToolName } from '../../schemas/stitch-tools.js';

// Tool definitions for Stitch's main chat. Shared by /api/ai, custom agents
// (agent-executor.ts) and the Stitch eval, which runs outside SvelteKit, so
// this file must stay free of $env and database imports.

/** Each tool takes its input_schema from the Zod schema that validates it. */
const inputSchema = (name: ToolName): Anthropic.Tool.InputSchema =>
	toolInputJsonSchema(toolSchemas[name]);

export const stitchToolDefinitions: Anthropic.Tool[] = [
	{
		name: 'create_brand',
		description: 'Create a new brand in the system.',
		input_schema: inputSchema('create_brand')
	},
	{
		name: 'update_brand',
		description: 'Update an existing brand. Provide the brand_id and any fields to change.',
		input_schema: inputSchema('update_brand')
	},
	{
		name: 'create_account',
		description:
			'Create a new wholesale account (retail buyer/store). If an active account with the same business_name already exists in this org, returns the existing row with already_exists=true instead of inserting a duplicate — treat that as the account and proceed.',
		input_schema: inputSchema('create_account')
	},
	{
		name: 'update_account',
		description: 'Update an existing account. Provide the account_id and any fields to change.',
		input_schema: inputSchema('update_account')
	},
	{
		name: 'create_order',
		description:
			'Create a wholesale order OR a note in one call: account, brand, ship window, and line items. order_type defaults to "order"; pass order_type="note" when the user says anything like "create note", "create a note", "notes out", "write up notes", "note for <account>", etc. — those phrases mean the record should be stored as a note, not a standard order. The server auto-resolves each line against the brand\'s product catalog by style_number OR by product name (passed as `description`) — that lookup supplies season_id and wholesale_price for you. DO NOT ask the user for a wholesale price; the product catalog has it. Only fall back to asking if the user explicitly says the item is not in the catalog. Season is derived from the products; do not pass season separately. Brand orgs should omit brand_name entirely. The server resolves the org\'s own brand, so never ask a brand user which brand their order is for. If the ship window is missing, ask the user for start_ship_date and complete_ship_date — do not guess. Sales rep defaults to the authenticated user unless rep_name is supplied. line_total and orders.total_amount are computed by the database; never pass them. Status defaults to "submitted" — pass status="draft" ONLY when the user explicitly asks to save a draft (e.g. "hold it", "save as draft"). Returns the order with joined brand, account, and season names.',
		input_schema: inputSchema('create_order')
	},
	{
		name: 'add_order_lines',
		description:
			'Add line items to an EXISTING order. For new orders, prefer create_order which accepts lines directly. Each line requires qty and unit_price; style_number, description, color, size are optional. line_total and orders.total_amount are computed by the database — never try to pass them.',
		input_schema: inputSchema('add_order_lines')
	},
	{
		name: 'update_order_status',
		description: 'Update the status of an order.',
		input_schema: inputSchema('update_order_status')
	},
	{
		name: 'create_season',
		description: 'Create a new season (e.g. "Fall", "Spring", "Resort").',
		input_schema: inputSchema('create_season')
	},
	{
		name: 'create_show',
		description: 'Create a new trade show or market event.',
		input_schema: inputSchema('create_show')
	},
	{
		name: 'list_brands',
		description:
			'List active brands as name+id pairs. Use for quick lookups before creating orders or when the user asks "what brands do we have". Faster and cheaper than query_data for simple list requests.',
		input_schema: inputSchema('list_brands')
	},
	{
		name: 'list_accounts',
		description:
			'List active accounts as business_name+id pairs with city/state. Use for quick lookups before creating orders or when the user asks "what accounts do we have". Faster and cheaper than query_data for simple list requests.',
		input_schema: inputSchema('list_accounts')
	},
	{
		name: 'query_data',
		description:
			'Search and list entities with optional filters. Supported entity values: brands, accounts, orders, shows, seasons, territories, appointments, contacts, order_lines, show_dates, products. Use filters as a key-value object keyed by column names (e.g., { status: "draft" } for orders, { business_name: "Nordstrom" } for accounts — string values use fuzzy ilike matching). For order_lines, order_id is required. Results are scoped to the current org and limited to 50 rows ordered by created_at desc. Prefer list_brands / list_accounts for simple name+id lookups.',
		input_schema: inputSchema('query_data')
	},
	{
		name: 'get_dashboard_metrics',
		description: 'Get aggregated dashboard metrics: order counts, revenue, status breakdowns.',
		input_schema: inputSchema('get_dashboard_metrics')
	},
	{
		name: 'draft_email',
		description:
			'Draft an email to a contact. Accepts either a direct email address or an account/brand name (fuzzy lookup) for the recipient. Returns a draft preview — this does NOT send the email. Call send_email separately after the user confirms the draft.',
		input_schema: inputSchema('draft_email')
	},
	{
		name: 'send_email',
		description:
			"Send an email via the user's connected Gmail account. Only call this after the user has confirmed a draft. Requires Gmail to be connected.",
		input_schema: inputSchema('send_email')
	},
	{
		name: 'search_emails',
		description: "Search the user's Gmail inbox for emails. Requires Gmail to be connected.",
		input_schema: inputSchema('search_emails')
	},
	{
		name: 'create_territory',
		description: 'Create a new geographic territory for organizing accounts and assigning reps.',
		input_schema: inputSchema('create_territory')
	},
	{
		name: 'update_territory',
		description: 'Update an existing territory.',
		input_schema: inputSchema('update_territory')
	},
	{
		name: 'assign_account_territory',
		description: 'Assign an account to a territory, or remove from territory.',
		input_schema: inputSchema('assign_account_territory')
	},
	{
		name: 'create_appointment',
		description:
			'Schedule an appointment with an account. Can be at a show, on the road, by phone, video, or other.',
		input_schema: inputSchema('create_appointment')
	},
	{
		name: 'update_appointment',
		description: 'Update an appointment — change status, reschedule, or add notes.',
		input_schema: inputSchema('update_appointment')
	},
	{
		name: 'delete_appointment',
		description: 'Delete an appointment.',
		input_schema: inputSchema('delete_appointment')
	},
	{
		name: 'update_order_line',
		description: 'Update the quantity of an order line item (increase or decrease).',
		input_schema: inputSchema('update_order_line')
	},
	{
		name: 'remove_order_line',
		description: 'Remove a line item from an order with a reason.',
		input_schema: inputSchema('remove_order_line')
	},
	{
		name: 'update_order',
		description: 'Update order details: notes, expected ship date, or cancellation reason.',
		input_schema: inputSchema('update_order')
	},
	{
		name: 'archive_entity',
		description: 'Archive or unarchive a brand or account.',
		input_schema: inputSchema('archive_entity')
	},
	{
		name: 'get_sales_report',
		description:
			'Get a sales report grouped by brand, account, territory, or rep. Returns order counts, revenue, and averages.',
		input_schema: inputSchema('get_sales_report')
	},
	{
		name: 'get_sales_analytics',
		description:
			'Fast, pre-computed sales analytics with date range support. Use this for any time-scoped sales question ("this month", "Q2", "last 30 days", "May vs April"). Returns revenue, order count, units sold, and avg order value. Can group by brand, account, rep, season, date, status, or source (in-house vs agency — brand orgs only). Prefer this over get_dashboard_metrics and get_sales_report for any question involving a time period.',
		input_schema: inputSchema('get_sales_analytics')
	},
	{
		name: 'get_style_velocity',
		description:
			'Get trending/hot-selling styles. Shows which styles are being ordered by the most accounts in a given time window. Useful for identifying demand signals and trending products.',
		input_schema: inputSchema('get_style_velocity')
	},
	{
		name: 'get_commission_report',
		description:
			'Get commission breakdown showing brand commission rates, rep commission rates, and earned amounts.',
		input_schema: inputSchema('get_commission_report')
	},
	{
		name: 'get_account_health',
		description:
			'Get account health scores. Shows which accounts are thriving, at risk, or need attention. Can filter by health label.',
		input_schema: inputSchema('get_account_health')
	},
	{
		name: 'add_product',
		description: "Add a product to a brand's catalog.",
		input_schema: inputSchema('add_product')
	},
	{
		name: 'update_products',
		description:
			"Bulk update fields on multiple products at once. Provide product_ids (array of UUIDs) and updates (object with fields to set). Useful for toggling ATS across many styles, reassigning season, adjusting prices, or archiving in bulk. All updates are scoped to the agent's organization.",
		input_schema: inputSchema('update_products')
	},
	{
		name: 'send_slack_message',
		description:
			'Send a notification message to the connected Slack channel. Requires Slack to be connected.',
		input_schema: inputSchema('send_slack_message')
	},
	{
		name: 'send_discord_message',
		description:
			'Send a notification message to the connected Discord channel. Requires Discord to be connected.',
		input_schema: inputSchema('send_discord_message')
	},
	{
		name: 'export_to_google_sheet',
		description:
			'Export data (orders, accounts, or brands) to a Google Sheets spreadsheet. Creates a new spreadsheet or adds a tab to an existing one. Requires Google Sheets to be connected.',
		input_schema: inputSchema('export_to_google_sheet')
	},
	{
		name: 'list_notion_databases',
		description:
			'List available Notion databases in the connected workspace. Requires Notion to be connected.',
		input_schema: inputSchema('list_notion_databases')
	},
	{
		name: 'sync_to_notion',
		description:
			'Sync data (orders, accounts, or brands) to a Notion database. Creates or updates pages. Requires Notion to be connected.',
		input_schema: inputSchema('sync_to_notion')
	},
	{
		name: 'pull_from_notion',
		description:
			'Pull pages from a Notion database. Returns page data including properties. Requires Notion to be connected.',
		input_schema: inputSchema('pull_from_notion')
	},
	{
		name: 'check_setup_status',
		description:
			'Check which organization setup sections are complete, incomplete, or skipped. Returns a boolean map of all sections.',
		input_schema: inputSchema('check_setup_status')
	},
	{
		name: 'update_org_settings',
		description: 'Update organization profile settings (business address, timezone, legal name).',
		input_schema: inputSchema('update_org_settings')
	},
	{
		name: 'update_org_shipping',
		description:
			'Update organization shipping configuration (ship-from address, default method, free threshold).',
		input_schema: inputSchema('update_org_shipping')
	},
	{
		name: 'update_org_payments',
		description:
			'Update organization payment configuration (accepted methods, default terms, deposits).',
		input_schema: inputSchema('update_org_payments')
	},
	{
		name: 'update_org_taxes',
		description: 'Update organization tax configuration (US sales tax, VAT, GST).',
		input_schema: inputSchema('update_org_taxes')
	},
	{
		name: 'update_org_returns',
		description: 'Update organization return policy (window, restocking fee, return address).',
		input_schema: inputSchema('update_org_returns')
	},
	{
		name: 'skip_setup_section',
		description:
			'Mark a setup section as skipped/not applicable or explicitly completed. Valid sections: orders, taxes, returns, members, products, accounts.',
		input_schema: inputSchema('skip_setup_section')
	}
];

export const WRITE_TOOLS: ReadonlySet<string> = new Set([
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
	'sync_to_notion',
	'update_org_settings',
	'update_org_shipping',
	'update_org_payments',
	'update_org_taxes',
	'update_org_returns',
	'skip_setup_section',
	'update_products'
]);

/**
 * Tools offered to the model for one turn. A null or empty whitelist means all
 * tools. The last tool carries cache_control so the whole tool block caches.
 */
export function buildStitchTools(whitelist: string[] | null): Anthropic.Tool[] {
	const available =
		whitelist && whitelist.length > 0
			? stitchToolDefinitions.filter((t) => whitelist.includes(t.name))
			: stitchToolDefinitions;
	return available.map((tool, i) =>
		i === available.length - 1
			? ({ ...tool, cache_control: { type: 'ephemeral' } } as Anthropic.Tool)
			: tool
	);
}
