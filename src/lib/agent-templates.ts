// Starter templates for the agent creation UI. Surfacing curated
// combinations of prompt + triggers + tools lowers the barrier to
// creating a useful agent and models the patterns we want to encourage.

export type AgentTemplate = {
	slug: string;
	name: string;
	description: string;
	system_prompt: string;
	suggested_triggers: Array<{
		trigger_type: 'event' | 'schedule';
		event_name?: string;
		cron_expression?: string;
	}>;
	suggested_tools: string[];
};

export const AGENT_TEMPLATES: AgentTemplate[] = [
	{
		slug: 'order-notifier',
		name: 'Order Notification Agent',
		description: 'Sends a summary to Slack when orders are submitted.',
		system_prompt: `When an order is submitted, summarize it concisely: order number, account, brand, total amount. Then send a Slack message with this summary. Keep it to 2-3 sentences.`,
		suggested_triggers: [{ trigger_type: 'event', event_name: 'order_submitted' }],
		suggested_tools: ['query_data', 'send_slack_message']
	},
	{
		slug: 'weekly-summary',
		name: 'Weekly Sales Summary Agent',
		description: 'Generates a weekly sales report and posts it to Slack.',
		system_prompt: `Generate a concise weekly sales summary. Use get_sales_report for the last 7 days, broken down by brand. Highlight top-performing brands and any notable changes. Keep it under 200 words.`,
		suggested_triggers: [{ trigger_type: 'schedule', cron_expression: '0 9 * * 1' }],
		suggested_tools: ['get_sales_report', 'get_dashboard_metrics', 'send_slack_message']
	},
	{
		slug: 'risk-monitor',
		name: 'At-Risk Account Monitor',
		description: 'Checks for at-risk accounts each morning and alerts the team.',
		system_prompt: `Check account health using get_account_health. For any accounts labeled "at_risk", look up their last order date and total lifetime value. Send a Discord message listing at-risk accounts with recommended actions (follow-up call, email, etc).`,
		suggested_triggers: [{ trigger_type: 'schedule', cron_expression: '0 8 * * *' }],
		suggested_tools: ['get_account_health', 'query_data', 'send_discord_message']
	},
	{
		slug: 'stale-order-reminder',
		name: 'Stale Draft Reminder',
		description: 'Flags draft orders that have been idle for more than 14 days.',
		system_prompt: `Find draft orders older than 14 days using query_data with { entity: "orders", filters: { status: "draft" } }. For each, list the order number, account name, brand, and days-since-created. Send a Slack message asking whether to submit or close them.`,
		suggested_triggers: [{ trigger_type: 'schedule', cron_expression: '0 10 * * 2' }],
		suggested_tools: ['query_data', 'send_slack_message']
	}
];

export function getTemplate(slug: string): AgentTemplate | undefined {
	return AGENT_TEMPLATES.find((t) => t.slug === slug);
}

// Tool catalog grouped for the agent whitelist UI. Keep in sync with
// _toolDefinitions in src/routes/api/ai/+server.ts.
export const TOOL_CATALOG: Array<{ group: string; tools: Array<{ name: string; label: string }> }> =
	[
		{
			group: 'Data',
			tools: [
				{ name: 'list_brands', label: 'List brands' },
				{ name: 'list_accounts', label: 'List accounts' },
				{ name: 'query_data', label: 'Search/query entities' },
				{ name: 'create_brand', label: 'Create brand' },
				{ name: 'update_brand', label: 'Update brand' },
				{ name: 'create_account', label: 'Create account' },
				{ name: 'update_account', label: 'Update account' },
				{ name: 'create_order', label: 'Create order' },
				{ name: 'update_order', label: 'Update order' },
				{ name: 'update_order_status', label: 'Update order status' },
				{ name: 'add_order_lines', label: 'Add order lines' },
				{ name: 'update_order_line', label: 'Update order line' },
				{ name: 'remove_order_line', label: 'Remove order line' },
				{ name: 'create_season', label: 'Create season' },
				{ name: 'create_show', label: 'Create show' },
				{ name: 'create_territory', label: 'Create territory' },
				{ name: 'update_territory', label: 'Update territory' },
				{ name: 'assign_account_territory', label: 'Assign account to territory' },
				{ name: 'create_appointment', label: 'Create appointment' },
				{ name: 'update_appointment', label: 'Update appointment' },
				{ name: 'delete_appointment', label: 'Delete appointment' },
				{ name: 'archive_entity', label: 'Archive entity' },
				{ name: 'add_product', label: 'Add product' }
			]
		},
		{
			group: 'Analytics',
			tools: [
				{ name: 'get_dashboard_metrics', label: 'Dashboard metrics' },
				{ name: 'get_sales_report', label: 'Sales report' },
				{ name: 'get_commission_report', label: 'Commission report' },
				{ name: 'get_style_velocity', label: 'Style velocity' },
				{ name: 'get_account_health', label: 'Account health' }
			]
		},
		{
			group: 'Email',
			tools: [
				{ name: 'draft_email', label: 'Draft email' },
				{ name: 'send_email', label: 'Send email' },
				{ name: 'search_emails', label: 'Search inbox' }
			]
		},
		{
			group: 'Integrations',
			tools: [
				{ name: 'send_slack_message', label: 'Send Slack message' },
				{ name: 'send_discord_message', label: 'Send Discord message' },
				{ name: 'export_to_google_sheet', label: 'Export to Google Sheets' },
				{ name: 'list_notion_databases', label: 'List Notion databases' },
				{ name: 'sync_to_notion', label: 'Sync to Notion' },
				{ name: 'pull_from_notion', label: 'Pull from Notion' }
			]
		}
	];

export const ALL_TOOL_NAMES: string[] = TOOL_CATALOG.flatMap((g) => g.tools.map((t) => t.name));
