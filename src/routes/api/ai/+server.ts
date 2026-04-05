import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { executeToolCall } from '$lib/server/ai-tools.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const toolDefinitions: Anthropic.Tool[] = [
	{
		name: 'create_brand',
		description: 'Create a new brand in the system.',
		input_schema: {
			type: 'object' as const,
			properties: {
				name: { type: 'string', description: 'Brand name (required)' },
				contact_name: { type: 'string', description: 'Primary contact name' },
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
				contact_name: { type: 'string', description: 'New contact name' },
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
				contact_name: { type: 'string', description: 'Contact person name' },
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
				contact_name: { type: 'string', description: 'New contact name' },
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
	}
];

const WRITE_TOOLS = new Set([
	'create_brand',
	'update_brand',
	'create_account',
	'update_account',
	'create_order',
	'add_order_lines',
	'update_order_status',
	'create_season',
	'create_show'
]);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { message, conversationHistory } = await request.json();

	if (!message || typeof message !== 'string') {
		return json({ error: 'Message is required' }, { status: 400 });
	}

	const role = locals.membership?.role ?? 'guest';
	const brandScopeInfo = locals.brandScope
		? `You are scoped to specific brands only. Only interact with data for your assigned brands.`
		: 'You have access to all brands in the organization.';

	const systemPrompt = `You are the AI assistant for ThreadLine, a multi-brand women's wholesale contractor portal. You help manage brands, accounts, orders, shows, and seasons.

Current user context:
- Organization: ${locals.organization.name}
- User: ${locals.user.display_name}
- Role: ${role}
- Brand access: ${brandScopeInfo}

Important rules:
1. ${role === 'guest' ? 'This user has READ-ONLY access. Do NOT perform any create, update, or delete operations. Only use query_data and get_dashboard_metrics.' : 'This user can perform read and write operations.'}
2. Season + year model: "Fall 2026" means season="Fall" and order_year=2026. Always split these when creating or querying orders.
3. When referencing accounts or brands by name, use fuzzy matching — users may not type exact names.
4. Always confirm what you did after performing an action.
5. Be concise and professional. This is a business tool.
6. When presenting data, format it clearly with relevant details.
7. If asked to do something outside your capabilities, explain what you can and cannot do.`;

	try {
		const messages: Anthropic.MessageParam[] = [
			...(conversationHistory ?? []),
			{ role: 'user' as const, content: message }
		];

		let response = await anthropic.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 4096,
			system: systemPrompt,
			tools: toolDefinitions,
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
					brandScope: locals.brandScope
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
				system: systemPrompt,
				tools: toolDefinitions,
				messages
			});
		}

		// Extract final text response
		const textBlocks = response.content.filter(
			(block): block is Anthropic.TextBlock => block.type === 'text'
		);
		const responseText = textBlocks.map((b) => b.text).join('\n');

		return json({
			response: responseText,
			actions: actions.length > 0 ? actions : undefined
		});
	} catch (err) {
		console.error('AI API error:', err);
		const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
		return json({ error: errorMessage }, { status: 500 });
	}
};
