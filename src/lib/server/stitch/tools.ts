import type Anthropic from '@anthropic-ai/sdk';

// Tool definitions for Stitch's main chat. Shared by /api/ai, custom agents
// (agent-executor.ts) and the Stitch eval, which runs outside SvelteKit, so
// this file must stay free of $env and database imports.
export const stitchToolDefinitions: Anthropic.Tool[] = [
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
			'Create a wholesale order OR a note in one call: account, brand, ship window, and line items. order_type defaults to "order"; pass order_type="note" when the user says anything like "create note", "create a note", "notes out", "write up notes", "note for <account>", etc. — those phrases mean the record should be stored as a note, not a standard order. The server auto-resolves each line against the brand\'s product catalog by style_number OR by product name (passed as `description`) — that lookup supplies season_id and wholesale_price for you. DO NOT ask the user for a wholesale price; the product catalog has it. Only fall back to asking if the user explicitly says the item is not in the catalog. Season is derived from the products; do not pass season separately. Brand orgs should omit brand_name entirely. The server resolves the org\'s own brand, so never ask a brand user which brand their order is for. If the ship window is missing, ask the user for start_ship_date and complete_ship_date — do not guess. Sales rep defaults to the authenticated user unless rep_name is supplied. line_total and orders.total_amount are computed by the database; never pass them. Status defaults to "submitted" — pass status="draft" ONLY when the user explicitly asks to save a draft (e.g. "hold it", "save as draft"). Returns the order with joined brand, account, and season names.',
		input_schema: {
			type: 'object' as const,
			properties: {
				account_name: {
					type: 'string',
					description: 'Account business name to fuzzy match (required)'
				},
				brand_name: {
					type: 'string',
					description:
						"Brand name to fuzzy match. Required for rep orgs, which represent many brands. OMIT this for brand orgs. The server fills in the org's own brand automatically. Only pass it for a brand org when the user explicitly names one of their other labels."
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
			required: ['account_name', 'start_ship_date', 'complete_ship_date', 'lines']
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
		name: 'get_sales_analytics',
		description:
			'Fast, pre-computed sales analytics with date range support. Use this for any time-scoped sales question ("this month", "Q2", "last 30 days", "May vs April"). Returns revenue, order count, units sold, and avg order value. Can group by brand, account, rep, season, date, status, or source (in-house vs agency — brand orgs only). Prefer this over get_dashboard_metrics and get_sales_report for any question involving a time period.',
		input_schema: {
			type: 'object' as const,
			properties: {
				date_from: {
					type: 'string',
					description:
						'Start date in YYYY-MM-DD format. Derive from natural language: "this month" → first day of current month, "Q2 2026" → 2026-04-01, "last 30 days" → today minus 30.'
				},
				date_to: {
					type: 'string',
					description:
						'End date in YYYY-MM-DD format. Derive from natural language: "this month" → today or last day of month, "Q2 2026" → 2026-06-30.'
				},
				season_name: {
					type: 'string',
					description: 'Filter by season name (fuzzy match). E.g. "Fall", "Spring 2026".'
				},
				brand_name: {
					type: 'string',
					description: 'Filter by brand name (fuzzy match).'
				},
				account_name: {
					type: 'string',
					description: 'Filter by account name (fuzzy match).'
				},
				rep_name: {
					type: 'string',
					description: 'Filter by rep name (fuzzy match).'
				},
				group_by: {
					type: 'string',
					enum: ['total', 'brand', 'account', 'rep', 'season', 'date', 'status', 'source'],
					description:
						'How to group results. "total" returns a single aggregate. "date" returns one row per day. "source" splits in-house vs agency (brand orgs only). Default: "total".'
				}
			},
			required: []
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
	},
	{
		name: 'check_setup_status',
		description:
			'Check which organization setup sections are complete, incomplete, or skipped. Returns a boolean map of all sections.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'update_org_settings',
		description: 'Update organization profile settings (business address, timezone, legal name).',
		input_schema: {
			type: 'object' as const,
			properties: {
				address_line1: { type: 'string', description: 'Street address line 1' },
				address_line2: { type: 'string', description: 'Street address line 2' },
				city: { type: 'string', description: 'City' },
				state: { type: 'string', description: 'State/province code' },
				zip: { type: 'string', description: 'ZIP/postal code' },
				country: { type: 'string', description: 'ISO 2-letter country code' },
				time_zone: { type: 'string', description: 'IANA timezone (e.g. America/New_York)' },
				legal_business_name: { type: 'string', description: 'Legal business name' }
			},
			required: []
		}
	},
	{
		name: 'update_org_shipping',
		description:
			'Update organization shipping configuration (ship-from address, default method, free threshold).',
		input_schema: {
			type: 'object' as const,
			properties: {
				use_business_address: {
					type: 'boolean',
					description: 'Use business address as ship-from'
				},
				shipping_from_line1: { type: 'string', description: 'Custom ship-from address line 1' },
				shipping_from_line2: { type: 'string', description: 'Custom ship-from address line 2' },
				shipping_from_city: { type: 'string', description: 'Custom ship-from city' },
				shipping_from_state: { type: 'string', description: 'Custom ship-from state' },
				shipping_from_zip: { type: 'string', description: 'Custom ship-from ZIP' },
				shipping_from_country: { type: 'string', description: 'Custom ship-from country code' },
				default_shipping_method_id: {
					type: 'string',
					description: 'UUID of the default shipping method'
				},
				default_method_name: {
					type: 'string',
					description: 'Name of default shipping method (fuzzy match)'
				},
				free_threshold_enabled: {
					type: 'boolean',
					description: 'Enable free shipping threshold'
				},
				free_threshold_amount: {
					type: 'number',
					description: 'Order amount for free shipping'
				}
			},
			required: []
		}
	},
	{
		name: 'update_org_payments',
		description:
			'Update organization payment configuration (accepted methods, default terms, deposits).',
		input_schema: {
			type: 'object' as const,
			properties: {
				accepted_methods: {
					type: 'array',
					items: { type: 'string' },
					description: 'Accepted payment method codes: credit_card, ach, check, wire, other'
				},
				default_method: { type: 'string', description: 'Default payment method code' },
				default_terms: {
					type: 'string',
					description: 'Default payment terms: net_15, net_30, net_60, net_90, cod, prepaid, other'
				},
				required_deposit_enabled: {
					type: 'boolean',
					description: 'Require deposit on orders'
				},
				required_deposit_percent: {
					type: 'number',
					description: 'Deposit percentage (0-100)'
				}
			},
			required: []
		}
	},
	{
		name: 'update_org_taxes',
		description: 'Update organization tax configuration (US sales tax, VAT, GST).',
		input_schema: {
			type: 'object' as const,
			properties: {
				pricing_display: {
					type: 'string',
					description: 'Tax display mode: exclusive or inclusive'
				},
				us_sales_tax_enabled: { type: 'boolean', description: 'Enable US sales tax' },
				us_ein: { type: 'string', description: 'US EIN/tax ID' },
				us_general_rate: { type: 'number', description: 'US general tax rate (0-100)' },
				vat_enabled: { type: 'boolean', description: 'Enable VAT' },
				vat_registration: { type: 'string', description: 'VAT registration number' },
				vat_rate: { type: 'number', description: 'VAT rate (0-100)' },
				gst_enabled: { type: 'boolean', description: 'Enable GST' },
				gst_registration: { type: 'string', description: 'GST registration number' },
				gst_rate: { type: 'number', description: 'GST rate (0-100)' }
			},
			required: []
		}
	},
	{
		name: 'update_org_returns',
		description: 'Update organization return policy (window, restocking fee, return address).',
		input_schema: {
			type: 'object' as const,
			properties: {
				window_days: { type: 'number', description: 'Return window in days (0 = no returns)' },
				policy_text: { type: 'string', description: 'Return policy text (markdown)' },
				use_ship_from_address: {
					type: 'boolean',
					description: 'Use ship-from address for returns'
				},
				address_line1: { type: 'string', description: 'Return address line 1' },
				address_line2: { type: 'string', description: 'Return address line 2' },
				address_city: { type: 'string', description: 'Return address city' },
				address_state: { type: 'string', description: 'Return address state' },
				address_zip: { type: 'string', description: 'Return address ZIP' },
				address_country: { type: 'string', description: 'Return address country code' },
				restocking_fee_type: { type: 'string', description: 'Fee type: percent or flat' },
				restocking_fee_value: { type: 'number', description: 'Restocking fee value' },
				buyer_pays_shipping: { type: 'boolean', description: 'Buyer pays return shipping' }
			},
			required: []
		}
	},
	{
		name: 'skip_setup_section',
		description:
			'Mark a setup section as skipped/not applicable or explicitly completed. Valid sections: orders, taxes, returns, members, products, accounts.',
		input_schema: {
			type: 'object' as const,
			properties: {
				section: {
					type: 'string',
					description: 'Section to update: orders, taxes, returns, members, products, accounts'
				},
				status: {
					type: 'string',
					description: 'Status to set: skipped (default) or completed'
				}
			},
			required: ['section']
		}
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
