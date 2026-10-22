import { z } from 'zod';

// Input contracts for Stitch's tools. Each schema is the single source
// for two things: the JSON Schema the model is offered (stitch/tools.ts
// generates input_schema from it) and the check a tool call must pass before
// its handler runs (ai-tools.ts and runStitchTurn). Field descriptions are
// model-facing prompt text, so edit them like prompt text.
//
// This file must stay free of $env and database imports: the Stitch eval
// imports it outside SvelteKit.

const text = (description: string) => z.string().describe(description);
const optText = (description: string) => z.string().describe(description).optional();
const optNumber = (description: string) => z.number().describe(description).optional();
const optFlag = (description: string) => z.boolean().describe(description).optional();

export const writeToolSchemas = {
	create_brand: z.object({
		name: text('Brand name (required)'),
		contact_first_name: optText('Primary contact first name'),
		contact_last_name: optText('Primary contact last name'),
		contact_email: optText('Contact email address'),
		contact_phone: optText('Contact phone number'),
		website: optText('Brand website URL'),
		notes: optText('Additional notes')
	}),

	update_brand: z.object({
		brand_id: text('ID of the brand to update (required)'),
		name: optText('New brand name'),
		contact_first_name: optText('New contact first name'),
		contact_last_name: optText('New contact last name'),
		contact_email: optText('New contact email'),
		contact_phone: optText('New contact phone'),
		website: optText('New website URL'),
		notes: optText('New notes')
	}),

	create_account: z.object({
		business_name: text('Business name (required)'),
		contact_first_name: optText('Contact person first name'),
		contact_last_name: optText('Contact person last name'),
		contact_email: optText('Contact email'),
		phone: optText('Phone number'),
		address_line1: optText('Street address'),
		city: optText('City'),
		state: optText('State'),
		zip: optText('ZIP code'),
		notes: optText('Additional notes')
	}),

	update_account: z.object({
		account_id: text('ID of the account to update (required)'),
		business_name: optText('New business name'),
		contact_first_name: optText('New contact first name'),
		contact_last_name: optText('New contact last name'),
		contact_email: optText('New contact email'),
		phone: optText('New phone'),
		address_line1: optText('New address'),
		city: optText('New city'),
		state: optText('New state'),
		zip: optText('New zip'),
		notes: optText('New notes')
	}),

	create_order: z.object({
		account_name: text('Account business name to fuzzy match (required)'),
		brand_name: optText(
			"Brand name to fuzzy match. Required for rep orgs, which represent many brands. OMIT this for brand orgs. The server fills in the org's own brand automatically. Only pass it for a brand org when the user explicitly names one of their other labels."
		),
		start_ship_date: text('Ship window start, YYYY-MM-DD (required — ask user if not given)'),
		complete_ship_date: text(
			'Ship window complete/end, YYYY-MM-DD (required — ask user if not given)'
		),
		lines: z
			.array(
				z.object({
					style_number: optText('Product style number (preferred).'),
					description: optText(
						'Product name (e.g. "Kailua Bubble Gauze Cotton Shirt"). Used for catalog lookup when style_number is unknown — pass this instead of asking the user for the price.'
					),
					color: z.string().optional(),
					size: z.string().optional(),
					qty: z.number(),
					unit_price: optNumber(
						'Only pass this when the product truly is not in the catalog AND the user has given you the price. For catalog items leave it off — the server fills in wholesale_price from the product row.'
					)
				})
			)
			.describe(
				'Line items, one per (style + size) pair. Product catalog lookup runs on EVERY line: pass style_number if you know it, otherwise pass the product name in `description` and the server will fuzzy-match it against the brand catalog to set season + unit_price automatically. qty is always required.'
			),
		rep_name: optText('Sales rep display name (fuzzy match). Omit to default to the current user.'),
		status: z
			.enum(['draft', 'submitted'])
			.describe(
				'Defaults to "submitted" when everything validates. Only pass "draft" if the user explicitly said "save as draft" or asked to hold the order for review.'
			)
			.optional(),
		order_type: z
			.enum(['order', 'note'])
			.describe(
				'Defaults to "order". Pass "note" when the user said any variant of "create note", "notes out", "note for <account>", "write a note", etc. Notes use the same schema as orders but are displayed as notes in the UI.'
			)
			.optional(),
		notes: optText('Order notes (optional)')
	}),

	add_order_lines: z.object({
		order_id: text('Order ID (required)'),
		lines: z
			.array(
				z.object({
					style_number: z.string().optional(),
					description: z.string().optional(),
					color: z.string().optional(),
					size: z.string().optional(),
					qty: z.number(),
					unit_price: z.number()
				})
			)
			.describe('Array of line items')
	}),

	update_order_status: z.object({
		order_id: text('Order ID (required)'),
		status: z
			.enum(['draft', 'submitted', 'confirmed', 'shipped', 'delivered', 'cancelled'])
			.describe('New order status (required)')
	}),

	create_season: z.object({
		name: text('Season name (required)'),
		sort_order: optNumber('Sort order for display')
	}),

	create_show: z.object({
		name: text('Show name (required)'),
		venue: optText('Venue name'),
		city: optText('City'),
		state: optText('State'),
		start_date: optText('Start date (YYYY-MM-DD)'),
		end_date: optText('End date (YYYY-MM-DD)'),
		season_name: optText('Season to associate (fuzzy match)'),
		year: optNumber('Year of the show')
	}),

	send_email: z.object({
		to: text('Recipient email address'),
		subject: text('Email subject line'),
		body: text('Email body text'),
		related_type: optText('Related entity type: account, brand, or order'),
		related_id: optText('Related entity ID')
	}),

	create_territory: z.object({
		name: text('Territory name (required), e.g. "West Coast", "Southeast"'),
		assigned_to_name: optText('Name of the team member to assign (fuzzy match)'),
		notes: optText('Optional notes')
	}),

	update_territory: z.object({
		territory_id: text('Territory ID (required)'),
		name: optText('New name'),
		assigned_to_name: optText('New assigned rep name (fuzzy match), or empty to unassign'),
		notes: optText('New notes')
	}),

	assign_account_territory: z.object({
		account_name: text('Account business name (fuzzy match, required)'),
		territory_name: optText('Territory name (fuzzy match). Leave empty to remove from territory.')
	}),

	create_appointment: z.object({
		account_name: text('Account business name (fuzzy match, required)'),
		location_type: z
			.enum(['show', 'road', 'phone', 'video', 'other'])
			.describe('Type of appointment location (required)'),
		location_detail: optText('Address, phone number, meeting link, or other details'),
		show_name: optText('Show name (fuzzy match) — only when location_type is "show"'),
		scheduled_date: optText('Date (YYYY-MM-DD)'),
		scheduled_time: optText('Time (HH:MM, 24h format)'),
		duration_minutes: optNumber('Duration in minutes (default 30)'),
		notes: optText('Notes')
	}),

	update_appointment: z.object({
		appointment_id: text('Appointment ID (required)'),
		status: z
			.enum(['scheduled', 'completed', 'cancelled', 'no_show'])
			.describe('New status')
			.optional(),
		scheduled_date: optText('New date (YYYY-MM-DD)'),
		scheduled_time: optText('New time (HH:MM)'),
		duration_minutes: optNumber('New duration'),
		notes: optText('New notes')
	}),

	delete_appointment: z.object({
		appointment_id: text('Appointment ID (required)')
	}),

	update_order_line: z.object({
		line_id: text('Order line ID (required)'),
		qty: z.number().describe('New quantity (required, must be >= 1)')
	}),

	remove_order_line: z.object({
		line_id: text('Order line ID (required)'),
		reason: text('Reason for removal (required)')
	}),

	update_order: z.object({
		order_id: text('Order ID (required)'),
		notes: optText('Order notes'),
		expected_ship_date: optText('Expected ship date (YYYY-MM-DD)'),
		cancelled_reason: optText('Reason for cancellation')
	}),

	archive_entity: z.object({
		entity_type: z.enum(['brand', 'account']).describe('Type of entity (required)'),
		entity_id: text('Entity ID (required)'),
		action: z.enum(['archive', 'unarchive']).describe('Archive or unarchive (required)')
	}),

	add_product: z.object({
		brand_name: text('Brand name (fuzzy match, required)'),
		style_number: text('Style number (required)'),
		name: text('Product name (required)'),
		wholesale_price: z.number().describe('Wholesale price (required)'),
		retail_price: optNumber('Retail price'),
		category: optText('Category (e.g. Tops, Bottoms, Dresses)'),
		description: optText('Product description'),
		season_name: optText('Season name (fuzzy match)')
	}),

	update_products: z.object({
		product_ids: z
			.array(z.string())
			.min(1)
			.describe('Array of product UUIDs to update (required, min 1)'),
		updates: z
			.object({
				ats: z.boolean().optional(),
				category: z.string().optional(),
				wholesale_price: z.number().optional(),
				retail_price: z.number().optional(),
				product_year: z.number().optional(),
				is_active: z.boolean().optional(),
				season_name: z.string().optional()
			})
			.describe(
				'Fields to set on every listed product. Allowed: ats (boolean), category (string), wholesale_price (number), retail_price (number), product_year (number), is_active (boolean), season_name (string, fuzzy-matched to a season in this org).'
			)
	}),

	send_slack_message: z.object({
		title: text('Message title/headline (required)'),
		text: text('Message body text (required)'),
		url: optText('Optional link URL to include'),
		color: optText('Hex color for the message sidebar (e.g. "#36a64f")')
	}),

	send_discord_message: z.object({
		title: text('Message title/headline (required)'),
		text: text('Message body text (required)'),
		url: optText('Optional link URL to include'),
		color: optText('Hex color for the embed (e.g. "#7289da")')
	}),

	export_to_google_sheet: z.object({
		data_type: z
			.enum(['orders', 'accounts', 'brands'])
			.describe('Type of data to export (required)'),
		title: optText('Sheet/tab title (defaults to data type + date)'),
		spreadsheet_id: optText('Existing spreadsheet ID to add a tab to. Omit to create new.')
	}),

	sync_to_notion: z.object({
		data_type: z.enum(['orders', 'accounts', 'brands']).describe('Type of data to sync (required)'),
		database_id: text(
			'Notion database ID to sync to (required). Use list_notion_databases to find available databases.'
		)
	}),

	update_org_settings: z.object({
		address_line1: optText('Street address line 1'),
		address_line2: optText('Street address line 2'),
		city: optText('City'),
		state: optText('State/province code'),
		zip: optText('ZIP/postal code'),
		country: optText('ISO 2-letter country code'),
		time_zone: optText('IANA timezone (e.g. America/New_York)'),
		legal_business_name: optText('Legal business name')
	}),

	update_org_shipping: z.object({
		use_business_address: optFlag('Use business address as ship-from'),
		shipping_from_line1: optText('Custom ship-from address line 1'),
		shipping_from_line2: optText('Custom ship-from address line 2'),
		shipping_from_city: optText('Custom ship-from city'),
		shipping_from_state: optText('Custom ship-from state'),
		shipping_from_zip: optText('Custom ship-from ZIP'),
		shipping_from_country: optText('Custom ship-from country code'),
		default_shipping_method_id: optText('UUID of the default shipping method'),
		default_method_name: optText('Name of default shipping method (fuzzy match)'),
		free_threshold_enabled: optFlag('Enable free shipping threshold'),
		free_threshold_amount: optNumber('Order amount for free shipping')
	}),

	update_org_payments: z.object({
		accepted_methods: z
			.array(z.string())
			.describe('Accepted payment method codes: credit_card, ach, check, wire, other')
			.optional(),
		default_method: optText('Default payment method code'),
		default_terms: optText(
			'Default payment terms: net_15, net_30, net_60, net_90, cod, prepaid, other'
		),
		required_deposit_enabled: optFlag('Require deposit on orders'),
		required_deposit_percent: optNumber('Deposit percentage (0-100)')
	}),

	update_org_taxes: z.object({
		pricing_display: optText('Tax display mode: exclusive or inclusive'),
		us_sales_tax_enabled: optFlag('Enable US sales tax'),
		us_ein: optText('US EIN/tax ID'),
		us_general_rate: optNumber('US general tax rate (0-100)'),
		vat_enabled: optFlag('Enable VAT'),
		vat_registration: optText('VAT registration number'),
		vat_rate: optNumber('VAT rate (0-100)'),
		gst_enabled: optFlag('Enable GST'),
		gst_registration: optText('GST registration number'),
		gst_rate: optNumber('GST rate (0-100)')
	}),

	update_org_returns: z.object({
		window_days: optNumber('Return window in days (0 = no returns)'),
		policy_text: optText('Return policy text (markdown)'),
		use_ship_from_address: optFlag('Use ship-from address for returns'),
		address_line1: optText('Return address line 1'),
		address_line2: optText('Return address line 2'),
		address_city: optText('Return address city'),
		address_state: optText('Return address state'),
		address_zip: optText('Return address ZIP'),
		address_country: optText('Return address country code'),
		restocking_fee_type: optText('Fee type: percent or flat'),
		restocking_fee_value: optNumber('Restocking fee value'),
		buyer_pays_shipping: optFlag('Buyer pays return shipping')
	}),

	skip_setup_section: z.object({
		section: z
			.enum(['orders', 'taxes', 'returns', 'members', 'products', 'accounts'])
			.describe('Section to update: orders, taxes, returns, members, products, accounts'),
		status: optText('Status to set: skipped (default) or completed')
	})
};

export const readToolSchemas = {
	list_brands: z.object({}),

	list_accounts: z.object({}),

	query_data: z.object({
		entity: z
			.enum([
				'brands',
				'accounts',
				'orders',
				'shows',
				'seasons',
				'territories',
				'appointments',
				'contacts',
				'order_lines',
				'show_dates',
				'products'
			])
			.describe('Entity type to query (required)'),
		filters: z
			.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
			.describe(
				'Key-value filters keyed by column name. String values use fuzzy matching (ilike %value%); numbers and booleans match exactly.'
			)
			.optional()
	}),

	get_dashboard_metrics: z.object({
		date_range: optText('Optional date range filter (not yet implemented)'),
		brand_id: optText('Filter by specific brand ID'),
		season_name: optText('Filter by season name (fuzzy match)'),
		order_year: optNumber('Filter by order year')
	}),

	draft_email: z.object({
		to: text('Recipient email address, or account/brand name to look up contact email'),
		subject: text('Email subject line'),
		body: text('Email body text'),
		related_type: optText('Related entity type: account, brand, or order'),
		related_id: optText('Related entity ID')
	}),

	search_emails: z.object({
		query: optText('Search query (Gmail search syntax)'),
		from: optText('Filter by sender email'),
		to: optText('Filter by recipient email')
	}),

	get_sales_report: z.object({
		group_by: z
			.enum(['brand', 'account', 'territory', 'rep'])
			.describe('How to group the data (required)'),
		order_year: optNumber('Filter by year'),
		season_name: optText('Filter by season (fuzzy match)')
	}),

	get_sales_analytics: z.object({
		date_from: optText(
			'Start date in YYYY-MM-DD format. Derive from natural language: "this month" → first day of current month, "Q2 2026" → 2026-04-01, "last 30 days" → today minus 30.'
		),
		date_to: optText(
			'End date in YYYY-MM-DD format. Derive from natural language: "this month" → today or last day of month, "Q2 2026" → 2026-06-30.'
		),
		season_name: optText('Filter by season name (fuzzy match). E.g. "Fall", "Spring 2026".'),
		brand_name: optText('Filter by brand name (fuzzy match).'),
		account_name: optText('Filter by account name (fuzzy match).'),
		rep_name: optText('Filter by rep name (fuzzy match).'),
		group_by: z
			.enum(['total', 'brand', 'account', 'rep', 'season', 'date', 'status', 'source'])
			.describe(
				'How to group results. "total" returns a single aggregate. "date" returns one row per day. "source" splits in-house vs agency (brand orgs only). Default: "total".'
			)
			.optional()
	}),

	get_style_velocity: z.object({
		days: optNumber('Time window in days (default 14). Common values: 7, 14, 30.'),
		brand_name: optText('Filter by brand name (fuzzy match)'),
		min_accounts: optNumber('Minimum number of accounts to qualify as trending (default 2)'),
		limit: optNumber('Max results to return (default 20)')
	}),

	get_commission_report: z.object({
		order_year: optNumber('Filter by year'),
		brand_name: optText('Filter by brand (fuzzy match)'),
		rep_name: optText('Filter by rep name (fuzzy match)')
	}),

	get_account_health: z.object({
		filter: z
			.enum(['excellent', 'good', 'fair', 'at_risk', 'inactive', 'new'])
			.describe('Filter by health label. Omit to see all.')
			.optional(),
		limit: optNumber('Max results (default 20)')
	}),

	list_notion_databases: z.object({}),

	pull_from_notion: z.object({
		database_id: text('Notion database ID to pull from (required)'),
		page_size: optNumber('Max pages to return (default 100)')
	}),

	check_setup_status: z.object({})
};

/** Every Stitch tool's input contract, writes and reads. */
export const toolSchemas = { ...writeToolSchemas, ...readToolSchemas };

export type ToolName = keyof typeof toolSchemas;
export type ToolInput<K extends ToolName> = z.output<(typeof toolSchemas)[K]>;

export function isToolName(name: string): name is ToolName {
	return Object.hasOwn(toolSchemas, name);
}

/**
 * The model sometimes sends `null` for a field it means to leave out. Every
 * field here is either required or optional, never nullable, so a null key
 * reads as absent. Applied at every depth (order lines, query filters).
 */
function dropNulls(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(dropNulls);
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, v]) => v !== null)
			.map(([k, v]) => [k, dropNulls(v)])
	);
}

export type ToolInputCheck<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Check one tool call against its schema. Unknown keys are stripped, so a
 * handler only ever sees the fields its schema declares. The error is written
 * for the model, which gets it back as the tool result and retries.
 */
export function parseToolInput<K extends ToolName>(
	name: K,
	input: unknown
): ToolInputCheck<ToolInput<K>> {
	const parsed = toolSchemas[name].safeParse(dropNulls(input));
	if (parsed.success) return { success: true, data: parsed.data as ToolInput<K> };
	const issues = parsed.error.issues
		.map((i) => `${i.path.length ? i.path.join('.') : 'input'}: ${i.message}`)
		.join('; ');
	return { success: false, error: `Invalid input for ${name}. ${issues}` };
}

/**
 * Same check for any tool name. A name with no schema is not a Stitch tool;
 * it passes through so the executor can answer "Unknown tool".
 */
export function checkToolInput(
	name: string,
	input: Record<string, unknown>
): ToolInputCheck<Record<string, unknown>> {
	if (!isToolName(name)) return { success: true, data: input };
	return parseToolInput(name, input);
}

/** input_schema for the Anthropic tool definition, generated from the Zod schema. */
export function toolInputJsonSchema(schema: z.ZodType): {
	type: 'object';
	[key: string]: unknown;
} {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { $schema, ...json } = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
	return { ...json, type: 'object' };
}
