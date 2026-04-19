import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { executeToolCall } from '$lib/server/ai-tools.js';
import { MAIN_STATIC_PROMPT, CLASSIFIER_PROMPT } from '$lib/server/ai-prompts.js';
import { logUsage } from '$lib/server/ai-usage.js';

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
		description:
			'Create a new wholesale account (retail buyer/store). If an active account with the same business_name already exists in this org, returns the existing row with already_exists=true instead of inserting a duplicate — treat that as the account and proceed.',
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
			'Create a wholesale order OR a note in one call: account, brand, ship window, and line items. order_type defaults to "order"; pass order_type="note" when the user says anything like "create note", "create a note", "notes out", "write up notes", "note for <account>", etc. — those phrases mean the record should be stored as a note, not a standard order. The server auto-resolves each line against the brand\'s product catalog by style_number OR by product name (passed as `description`) — that lookup supplies season_id and wholesale_price for you. DO NOT ask the user for a wholesale price; the product catalog has it. Only fall back to asking if the user explicitly says the item is not in the catalog. Season is derived from the products; do not pass season separately. If the ship window is missing, ask the user for start_ship_date and complete_ship_date — do not guess. Sales rep defaults to the authenticated user unless rep_name is supplied. line_total and orders.total_amount are computed by the database; never pass them. Status defaults to "submitted" — pass status="draft" ONLY when the user explicitly asks to save a draft (e.g. "hold it", "save as draft"). Returns the order with joined brand, account, and season names.',
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
				start_ship_date: {
					type: 'string',
					description: 'Ship window start, YYYY-MM-DD (required — ask user if not given)'
				},
				complete_ship_date: {
					type: 'string',
					description: 'Ship window complete/end, YYYY-MM-DD (required — ask user if not given)'
				},
				lines: {
					type: 'array',
					description:
						'Line items, one per (style + size) pair. Product catalog lookup runs on EVERY line: pass style_number if you know it, otherwise pass the product name in `description` and the server will fuzzy-match it against the brand catalog to set season + unit_price automatically. qty is always required.',
					items: {
						type: 'object',
						properties: {
							style_number: { type: 'string', description: 'Product style number (preferred).' },
							description: {
								type: 'string',
								description:
									'Product name (e.g. "Kailua Bubble Gauze Cotton Shirt"). Used for catalog lookup when style_number is unknown — pass this instead of asking the user for the price.'
							},
							color: { type: 'string' },
							size: { type: 'string' },
							qty: { type: 'number' },
							unit_price: {
								type: 'number',
								description:
									'Only pass this when the product truly is not in the catalog AND the user has given you the price. For catalog items leave it off — the server fills in wholesale_price from the product row.'
							}
						},
						required: ['qty']
					}
				},
				rep_name: {
					type: 'string',
					description: 'Sales rep display name (fuzzy match). Omit to default to the current user.'
				},
				status: {
					type: 'string',
					enum: ['draft', 'submitted'],
					description:
						'Defaults to "submitted" when everything validates. Only pass "draft" if the user explicitly said "save as draft" or asked to hold the order for review.'
				},
				order_type: {
					type: 'string',
					enum: ['order', 'note'],
					description:
						'Defaults to "order". Pass "note" when the user said any variant of "create note", "notes out", "note for <account>", "write a note", etc. Notes use the same schema as orders but are displayed as notes in the UI.'
				},
				notes: { type: 'string', description: 'Order notes (optional)' }
			},
			required: ['account_name', 'brand_name', 'start_ship_date', 'complete_ship_date', 'lines']
		}
	},
	{
		name: 'add_order_lines',
		description:
			'Add line items to an EXISTING order. For new orders, prefer create_order which accepts lines directly. Each line requires qty and unit_price; style_number, description, color, size are optional. line_total and orders.total_amount are computed by the database — never try to pass them.',
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
		name: 'list_brands',
		description:
			'List active brands as name+id pairs. Use for quick lookups before creating orders or when the user asks "what brands do we have". Faster and cheaper than query_data for simple list requests.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'list_accounts',
		description:
			'List active accounts as business_name+id pairs with city/state. Use for quick lookups before creating orders or when the user asks "what accounts do we have". Faster and cheaper than query_data for simple list requests.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'query_data',
		description:
			'Search and list entities with optional filters. Supported entity values: brands, accounts, orders, shows, seasons, territories, appointments, contacts, order_lines, show_dates, products. Use filters as a key-value object keyed by column names (e.g., { status: "draft" } for orders, { business_name: "Nordstrom" } for accounts — string values use fuzzy ilike matching). For order_lines, order_id is required. Results are scoped to the current org and limited to 50 rows ordered by created_at desc. Prefer list_brands / list_accounts for simple name+id lookups.',
		input_schema: {
			type: 'object' as const,
			properties: {
				entity: {
					type: 'string',
					enum: [
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
					],
					description: 'Entity type to query (required)'
				},
				filters: {
					type: 'object',
					description:
						'Key-value filters keyed by column name. String values use fuzzy matching (ilike %value%); numbers and booleans match exactly.',
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
			'Draft an email to a contact. Accepts either a direct email address or an account/brand name (fuzzy lookup) for the recipient. Returns a draft preview — this does NOT send the email. Call send_email separately after the user confirms the draft.',
		input_schema: {
			type: 'object' as const,
			properties: {
				to: {
					type: 'string',
					description: 'Recipient email address, or account/brand name to look up contact email'
				},
				subject: { type: 'string', description: 'Email subject line' },
				body: { type: 'string', description: 'Email body text' },
				related_type: {
					type: 'string',
					description: 'Related entity type: account, brand, or order'
				},
				related_id: { type: 'string', description: 'Related entity ID' }
			},
			required: ['to', 'subject', 'body']
		}
	},
	{
		name: 'send_email',
		description:
			"Send an email via the user's connected Gmail account. Only call this after the user has confirmed a draft. Requires Gmail to be connected.",
		input_schema: {
			type: 'object' as const,
			properties: {
				to: { type: 'string', description: 'Recipient email address' },
				subject: { type: 'string', description: 'Email subject line' },
				body: { type: 'string', description: 'Email body text' },
				related_type: {
					type: 'string',
					description: 'Related entity type: account, brand, or order'
				},
				related_id: { type: 'string', description: 'Related entity ID' }
			},
			required: ['to', 'subject', 'body']
		}
	},
	{
		name: 'search_emails',
		description: "Search the user's Gmail inbox for emails. Requires Gmail to be connected.",
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
				name: {
					type: 'string',
					description: 'Territory name (required), e.g. "West Coast", "Southeast"'
				},
				assigned_to_name: {
					type: 'string',
					description: 'Name of the team member to assign (fuzzy match)'
				},
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
				assigned_to_name: {
					type: 'string',
					description: 'New assigned rep name (fuzzy match), or empty to unassign'
				},
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
				account_name: {
					type: 'string',
					description: 'Account business name (fuzzy match, required)'
				},
				territory_name: {
					type: 'string',
					description: 'Territory name (fuzzy match). Leave empty to remove from territory.'
				}
			},
			required: ['account_name']
		}
	},
	{
		name: 'create_appointment',
		description:
			'Schedule an appointment with an account. Can be at a show, on the road, by phone, video, or other.',
		input_schema: {
			type: 'object' as const,
			properties: {
				account_name: {
					type: 'string',
					description: 'Account business name (fuzzy match, required)'
				},
				location_type: {
					type: 'string',
					enum: ['show', 'road', 'phone', 'video', 'other'],
					description: 'Type of appointment location (required)'
				},
				location_detail: {
					type: 'string',
					description: 'Address, phone number, meeting link, or other details'
				},
				show_name: {
					type: 'string',
					description: 'Show name (fuzzy match) — only when location_type is "show"'
				},
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
				status: {
					type: 'string',
					enum: ['scheduled', 'completed', 'cancelled', 'no_show'],
					description: 'New status'
				},
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
				entity_type: {
					type: 'string',
					enum: ['brand', 'account'],
					description: 'Type of entity (required)'
				},
				entity_id: { type: 'string', description: 'Entity ID (required)' },
				action: {
					type: 'string',
					enum: ['archive', 'unarchive'],
					description: 'Archive or unarchive (required)'
				}
			},
			required: ['entity_type', 'entity_id', 'action']
		}
	},
	{
		name: 'get_sales_report',
		description:
			'Get a sales report grouped by brand, account, territory, or rep. Returns order counts, revenue, and averages.',
		input_schema: {
			type: 'object' as const,
			properties: {
				group_by: {
					type: 'string',
					enum: ['brand', 'account', 'territory', 'rep'],
					description: 'How to group the data (required)'
				},
				order_year: { type: 'number', description: 'Filter by year' },
				season_name: { type: 'string', description: 'Filter by season (fuzzy match)' }
			},
			required: ['group_by']
		}
	},
	{
		name: 'get_style_velocity',
		description:
			'Get trending/hot-selling styles. Shows which styles are being ordered by the most accounts in a given time window. Useful for identifying demand signals and trending products.',
		input_schema: {
			type: 'object' as const,
			properties: {
				days: {
					type: 'number',
					description: 'Time window in days (default 14). Common values: 7, 14, 30.'
				},
				brand_name: { type: 'string', description: 'Filter by brand name (fuzzy match)' },
				min_accounts: {
					type: 'number',
					description: 'Minimum number of accounts to qualify as trending (default 2)'
				},
				limit: { type: 'number', description: 'Max results to return (default 20)' }
			},
			required: []
		}
	},
	{
		name: 'get_commission_report',
		description:
			'Get commission breakdown showing brand commission rates, rep commission rates, and earned amounts.',
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
		description:
			'Get account health scores. Shows which accounts are thriving, at risk, or need attention. Can filter by health label.',
		input_schema: {
			type: 'object' as const,
			properties: {
				filter: {
					type: 'string',
					enum: ['excellent', 'good', 'fair', 'at_risk', 'inactive', 'new'],
					description: 'Filter by health label. Omit to see all.'
				},
				limit: { type: 'number', description: 'Max results (default 20)' }
			},
			required: []
		}
	},
	{
		name: 'add_product',
		description: "Add a product to a brand's catalog.",
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
		name: 'update_products',
		description:
			"Bulk update fields on multiple products at once. Provide product_ids (array of UUIDs) and updates (object with fields to set). Useful for toggling ATS across many styles, reassigning season, adjusting prices, or archiving in bulk. All updates are scoped to the agent's organization.",
		input_schema: {
			type: 'object' as const,
			properties: {
				product_ids: {
					type: 'array',
					items: { type: 'string' },
					description: 'Array of product UUIDs to update (required, min 1)'
				},
				updates: {
					type: 'object',
					description:
						'Fields to set on every listed product. Allowed: ats (boolean), category (string), wholesale_price (number), retail_price (number), product_year (number), is_active (boolean), season_name (string, fuzzy-matched to a season in this org).'
				}
			},
			required: ['product_ids', 'updates']
		}
	},
	{
		name: 'send_slack_message',
		description:
			'Send a notification message to the connected Slack channel. Requires Slack to be connected.',
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
		description:
			'Send a notification message to the connected Discord channel. Requires Discord to be connected.',
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
		description:
			'Export data (orders, accounts, or brands) to a Google Sheets spreadsheet. Creates a new spreadsheet or adds a tab to an existing one. Requires Google Sheets to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {
				data_type: {
					type: 'string',
					enum: ['orders', 'accounts', 'brands'],
					description: 'Type of data to export (required)'
				},
				title: { type: 'string', description: 'Sheet/tab title (defaults to data type + date)' },
				spreadsheet_id: {
					type: 'string',
					description: 'Existing spreadsheet ID to add a tab to. Omit to create new.'
				}
			},
			required: ['data_type']
		}
	},
	{
		name: 'list_notion_databases',
		description:
			'List available Notion databases in the connected workspace. Requires Notion to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'sync_to_notion',
		description:
			'Sync data (orders, accounts, or brands) to a Notion database. Creates or updates pages. Requires Notion to be connected.',
		input_schema: {
			type: 'object' as const,
			properties: {
				data_type: {
					type: 'string',
					enum: ['orders', 'accounts', 'brands'],
					description: 'Type of data to sync (required)'
				},
				database_id: {
					type: 'string',
					description:
						'Notion database ID to sync to (required). Use list_notion_databases to find available databases.'
				}
			},
			required: ['data_type', 'database_id']
		}
	},
	{
		name: 'pull_from_notion',
		description:
			'Pull pages from a Notion database. Returns page data including properties. Requires Notion to be connected.',
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
	if (path === '/') return 'Home';
	if (path === '/dashboard') return 'Buyer dashboard';
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

	const {
		message,
		files,
		conversationHistory,
		currentPage,
		entityContext: entityCtx,
		agentId,
		stream
	} = await request.json();
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
	let agentToolWhitelist: string[] | null = null;
	if (slugMatch && !resolvedAgentId) {
		const { data: agentBySlug } = await locals.supabase
			.from('org_agents')
			.select('id, system_prompt, tool_whitelist')
			.eq('organization_id', locals.organization.id)
			.eq('slug', slugMatch[1])
			.eq('is_active', true)
			.single();
		if (agentBySlug) {
			resolvedAgentId = agentBySlug.id;
			agentPrompt = agentBySlug.system_prompt;
			agentToolWhitelist = agentBySlug.tool_whitelist;
			cleanMessage = message.slice(slugMatch[0].length);
		}
	}

	if (resolvedAgentId && !agentPrompt) {
		const { data: agentById } = await locals.supabase
			.from('org_agents')
			.select('system_prompt, tool_whitelist')
			.eq('id', resolvedAgentId)
			.eq('is_active', true)
			.single();
		if (agentById) {
			agentPrompt = agentById.system_prompt;
			agentToolWhitelist = agentById.tool_whitelist;
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

	// Static system instructions (cacheable — same for all users/requests).
	// Sourced from $lib/server/ai-prompts so we can version it and share
	// the constant with observability tooling.
	const staticSystem = MAIN_STATIC_PROMPT;

	// Dynamic per-request context
	const entityInfo = entityCtx?.summary
		? `\n- Entity in view: ${entityCtx.summary}. The user is currently looking at this ${entityCtx.type} — use this context to answer questions without requiring them to re-specify which ${entityCtx.type} they mean.`
		: '';

	const orgTypeLabel = locals.orgType === 'brand' ? 'Brand (manufacturer)' : 'Rep (sales agency)';

	// Check setup state for new rep orgs.
	// All four counts rely on RLS so federation visibility counts: a rep connected
	// to a brand org that already has brands/products/accounts is NOT a new workspace,
	// even if they haven't created their own data yet. Orders are always rep-owned,
	// but we keep the default (RLS also returns own-org orders for reps).
	let setupInfo = '';
	if (locals.orgType === 'rep') {
		const [brandCheck, productCheck, accountCheck, orderCheck] = await Promise.all([
			locals.supabase
				.from('brands')
				.select('id', { count: 'exact', head: true })
				.eq('is_active', true),
			locals.supabase
				.from('products')
				.select('id', { count: 'exact', head: true })
				.eq('is_active', true),
			locals.supabase
				.from('accounts')
				.select('id', { count: 'exact', head: true })
				.eq('is_active', true),
			locals.supabase.from('orders').select('id', { count: 'exact', head: true })
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

	const now = new Date();
	const dateStr = now.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
	const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

	const dynamicSystem = `Current user context:
- Organization: ${locals.organization.name}
- Org type: ${orgTypeLabel}
- User: ${locals.user.display_name}
- Role: ${role}
- Brand access: ${brandScopeInfo}
- Current date/time: ${dateStr} at ${timeStr}
- Currently viewing: ${pageContext}${entityInfo}
${locals.orgType === 'brand' ? '\nThis is a BRAND organization. The user manages their own product catalog and sees orders from connected reps. Focus on products, rep performance, and order fulfillment.' : ''}${setupInfo}${role === 'guest' ? '\nIMPORTANT: This user has READ-ONLY access. Do NOT perform any create, update, or delete operations. Only use query_data, list_brands, list_accounts, get_dashboard_metrics, get_sales_report, get_commission_report, and get_style_velocity.' : ''}`;

	// Use structured system blocks for prompt caching
	const systemBlocks: Anthropic.TextBlockParam[] = [
		{
			type: 'text',
			text: staticSystem,
			cache_control: { type: 'ephemeral' }
		} as Anthropic.TextBlockParam,
		{ type: 'text', text: dynamicSystem }
	];

	// Inject custom agent prompt if active
	if (agentPrompt) {
		systemBlocks.push({
			type: 'text',
			text: `\n\nCUSTOM AGENT INSTRUCTIONS:\n${agentPrompt}`
		});
	}

	// Filter tools by agent whitelist (null or empty = all tools)
	const availableTools =
		agentToolWhitelist && agentToolWhitelist.length > 0
			? _toolDefinitions.filter((t) => agentToolWhitelist!.includes(t.name))
			: _toolDefinitions;

	// Mark the last tool for caching (caches all tools up to this point)
	const cachedTools = availableTools.map((tool, i) =>
		i === availableTools.length - 1
			? ({ ...tool, cache_control: { type: 'ephemeral' } } as Anthropic.Tool)
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
			// Include the last 2 messages of history so follow-ups like "what about
			// the other ones?" classify correctly against prior tool context.
			const classifyMessages: Anthropic.MessageParam[] = [];
			for (const msg of (conversationHistory ?? []).slice(-2)) {
				classifyMessages.push({ role: msg.role, content: msg.content });
			}
			classifyMessages.push({ role: 'user', content: userContent });

			const classifyResponse = await anthropic.messages.create({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 20,
				system: [{ type: 'text', text: CLASSIFIER_PROMPT }],
				messages: classifyMessages
			});
			logUsage({
				endpoint: 'chat',
				purpose: 'classifier',
				model: 'claude-haiku-4-5-20251001',
				organizationId: locals.organization!.id,
				userId: locals.user!.id,
				response: classifyResponse
			});
			const classification =
				classifyResponse.content[0]?.type === 'text'
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
			logUsage({
				endpoint: 'chat',
				purpose: 'chat',
				model: 'claude-haiku-4-5-20251001',
				organizationId: locals.organization!.id,
				userId: locals.user!.id,
				response: haikuResponse
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
				} catch {
					/* leave as-is */
				}
			}

			return json({ response: responseText, suggestions });
		}

		// Streaming branch: return Server-Sent Events so the client can render
		// text deltas and tool progress as they arrive instead of waiting for
		// the full multi-iteration tool loop to finish.
		if (stream === true) {
			return streamResponse({
				anthropic,
				systemBlocks,
				cachedTools,
				messages,
				locals,
				role,
				origin,
				resolvedAgentId,
				cleanMessage,
				requestStartTime
			});
		}

		let response = await anthropic.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 4096,
			system: systemBlocks,
			tools: cachedTools,
			messages
		});
		logUsage({
			endpoint: 'chat',
			purpose: 'tools',
			model: 'claude-sonnet-4-20250514',
			organizationId: locals.organization!.id,
			userId: locals.user!.id,
			response
		});

		const actions: Array<{ tool: string; input: Record<string, unknown>; result: unknown }> = [];
		const MAX_TOOL_ITERATIONS = 10;
		let toolIterations = 0;

		// Handle tool use loop (Claude may call multiple tools in sequence)
		while (response.stop_reason === 'tool_use' && toolIterations++ < MAX_TOOL_ITERATIONS) {
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
			logUsage({
				endpoint: 'chat',
				purpose: 'tools',
				model: 'claude-sonnet-4-20250514',
				organizationId: locals.organization!.id,
				userId: locals.user!.id,
				response
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
			await locals.supabase.from('org_agent_runs').insert({
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

type StreamResponseParams = {
	anthropic: Anthropic;
	systemBlocks: Anthropic.TextBlockParam[];
	cachedTools: Anthropic.Tool[];
	messages: Anthropic.MessageParam[];
	locals: App.Locals;
	role: string;
	origin: string;
	resolvedAgentId: string | null;
	cleanMessage: string;
	requestStartTime: number;
};

function streamResponse(params: StreamResponseParams): Response {
	const encoder = new TextEncoder();
	const send = (controller: ReadableStreamDefaultController, payload: unknown) => {
		controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
	};

	const stream = new ReadableStream({
		async start(controller) {
			const actions: Array<{ tool: string; input: Record<string, unknown>; result: unknown }> = [];
			const MAX_TOOL_ITERATIONS = 10;
			let accumulatedText = '';
			const messages = params.messages;

			try {
				let iteration = 0;
				let stopReason: string | null = null;

				while (iteration++ < MAX_TOOL_ITERATIONS) {
					const modelStream = params.anthropic.messages.stream({
						model: 'claude-sonnet-4-20250514',
						max_tokens: 4096,
						system: params.systemBlocks,
						tools: params.cachedTools,
						messages
					});

					modelStream.on('text', (delta: string) => {
						accumulatedText += delta;
						send(controller, { type: 'text', delta });
					});

					const finalMessage = await modelStream.finalMessage();
					stopReason = finalMessage.stop_reason ?? null;
					logUsage({
						endpoint: 'chat',
						purpose: 'tools',
						model: 'claude-sonnet-4-20250514',
						organizationId: params.locals.organization!.id,
						userId: params.locals.user!.id,
						response: finalMessage
					});

					if (stopReason !== 'tool_use') {
						messages.push({ role: 'assistant', content: finalMessage.content });
						break;
					}

					// Execute tool calls, streaming progress events
					const toolResults: Anthropic.ToolResultBlockParam[] = [];
					for (const block of finalMessage.content) {
						if (block.type !== 'tool_use') continue;
						send(controller, { type: 'tool_start', name: block.name });

						if (WRITE_TOOLS.has(block.name) && params.role === 'guest') {
							const denied = {
								success: false,
								error: 'Permission denied. Guest users have read-only access.'
							};
							toolResults.push({
								type: 'tool_result',
								tool_use_id: block.id,
								content: JSON.stringify(denied)
							});
							send(controller, { type: 'tool_result', name: block.name, ok: false });
							continue;
						}

						const toolInput = block.input as Record<string, unknown>;
						if (
							params.locals.brandScope &&
							['update_brand'].includes(block.name) &&
							toolInput.brand_id &&
							!params.locals.brandScope.includes(toolInput.brand_id as string)
						) {
							const denied = {
								success: false,
								error: 'Access denied. This brand is outside your scope.'
							};
							toolResults.push({
								type: 'tool_result',
								tool_use_id: block.id,
								content: JSON.stringify(denied)
							});
							send(controller, { type: 'tool_result', name: block.name, ok: false });
							continue;
						}

						const result = await executeToolCall(block.name, toolInput, {
							supabase: params.locals.supabase,
							organizationId: params.locals.organization!.id,
							userId: params.locals.user!.id,
							brandScope: params.locals.brandScope,
							orgType: params.locals.orgType,
							origin: params.origin
						});

						actions.push({ tool: block.name, input: toolInput, result });
						toolResults.push({
							type: 'tool_result',
							tool_use_id: block.id,
							content: JSON.stringify(result)
						});
						send(controller, {
							type: 'tool_result',
							name: block.name,
							ok: (result as { success?: boolean }).success !== false
						});
					}

					messages.push({ role: 'assistant', content: finalMessage.content });
					messages.push({ role: 'user', content: toolResults });
				}

				// Parse suggestions out of the last line before finalizing
				let responseText = accumulatedText;
				let suggestions: string[] | undefined;
				const lines = responseText.trimEnd().split('\n');
				const lastLine = lines[lines.length - 1];
				if (lastLine?.startsWith('SUGGESTIONS:')) {
					try {
						suggestions = JSON.parse(lastLine.slice('SUGGESTIONS:'.length));
						responseText = lines.slice(0, -1).join('\n').trimEnd();
					} catch {
						/* leave as-is */
					}
				}

				if (params.resolvedAgentId) {
					const toolNames = actions.map((a) => a.tool);
					await params.locals.supabase.from('org_agent_runs').insert({
						agent_id: params.resolvedAgentId,
						organization_id: params.locals.organization!.id,
						triggered_by: 'user',
						input_prompt: params.cleanMessage,
						output_text: responseText,
						tools_used: toolNames.length > 0 ? toolNames : null,
						status: 'completed',
						completed_at: new Date().toISOString(),
						duration_ms: Date.now() - params.requestStartTime
					});
				}

				send(controller, {
					type: 'done',
					response: responseText,
					actions: actions.length > 0 ? actions : undefined,
					suggestions
				});
			} catch (err) {
				console.error('AI stream error:', err);
				const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
				send(controller, { type: 'error', error: errorMessage });
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
}
