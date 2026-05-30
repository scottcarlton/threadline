import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { logUsage } from '$lib/server/ai-usage.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { MessagingChannel, ConversationMessage } from './types.js';
import { buildConversationHistory } from './session.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

type AgentContext = {
	orgName: string;
	userName: string;
	role: string;
	channel: MessagingChannel;
};

type AgentInput = {
	context: AgentContext;
	conversationHistory: ConversationMessage[];
	newMessage: string;
	organizationId: string;
	userId: string;
	brandScope: string[] | null;
	orgType: 'rep' | 'brand';
	mediaUrl?: string | null;
};

export function buildSystemPrompt(ctx: AgentContext): string {
	const channelNote =
		ctx.channel === 'sms'
			? 'You are responding via SMS. Keep replies under 160 characters when possible. Use plain text only — no markdown, no emojis, no formatting.'
			: 'You are responding via WhatsApp. You can use *bold* and _italic_ formatting. Keep replies concise but informative.';

	return `You are Threadline's messaging assistant for ${ctx.orgName}. You are chatting with ${ctx.userName} (${ctx.role}).

You help with:
- Placing wholesale orders (ask for account, brand, products, sizes, quantities, ship dates)
- Checking inventory and product availability
- Looking up order status
- Searching accounts
- Answering questions about sales and reports

${channelNote}

Rules:
- Be direct and concise. This is a text conversation, not an email.
- Use industry language naturally (line sheets, at-once orders, sell-through).
- If you're not sure about something, ask to clarify rather than guessing.
- Orders you create start as drafts unless the user says to submit.
- If you can't help with something, say so clearly.
- Never make up data. Only report what the tools return.`;
}

export const MESSAGING_TOOLS: Anthropic.Tool[] = [
	{
		name: 'place_order',
		description:
			'Create a draft order. Requires account_name, brand_name, ship dates, and at least one line item with product and sizes/quantities.',
		input_schema: {
			type: 'object' as const,
			properties: {
				account_name: { type: 'string', description: 'Buyer/retailer name (fuzzy match)' },
				brand_name: { type: 'string', description: 'Brand name (fuzzy match)' },
				start_ship_date: { type: 'string', description: 'Ship window start, YYYY-MM-DD' },
				complete_ship_date: { type: 'string', description: 'Ship window end, YYYY-MM-DD' },
				lines: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							description: { type: 'string', description: 'Product name' },
							style_number: { type: 'string', description: 'Style number if known' },
							color: { type: 'string' },
							size: { type: 'string' },
							qty: { type: 'number' }
						},
						required: ['qty']
					}
				},
				notes: { type: 'string' }
			},
			required: ['account_name', 'brand_name', 'start_ship_date', 'complete_ship_date', 'lines']
		}
	},
	{
		name: 'lookup_inventory',
		description:
			'Check product inventory/availability. Search by product name, style number, or brand.',
		input_schema: {
			type: 'object' as const,
			properties: {
				query: { type: 'string', description: 'Product name, style number, or brand to search' },
				brand_name: { type: 'string', description: 'Filter by brand name (optional)' }
			},
			required: ['query']
		}
	},
	{
		name: 'check_order_status',
		description: 'Look up the status of an order by order number or account name.',
		input_schema: {
			type: 'object' as const,
			properties: {
				order_number: { type: 'string', description: 'Order number (e.g. "1042")' },
				account_name: { type: 'string', description: 'Account name to find recent orders' }
			},
			required: []
		}
	},
	{
		name: 'search_accounts',
		description: 'Search for buyer accounts by name.',
		input_schema: {
			type: 'object' as const,
			properties: {
				query: { type: 'string', description: 'Account name to search' }
			},
			required: ['query']
		}
	}
];

async function executeMessagingTool(
	toolName: string,
	input: Record<string, unknown>,
	organizationId: string,
	userId: string,
	brandScope: string[] | null,
	orgType: 'rep' | 'brand'
): Promise<string> {
	switch (toolName) {
		case 'lookup_inventory': {
			const query = input.query as string;

			let productQuery = supabaseAdmin
				.from('products')
				.select('id, name, style_number, wholesale_price, brands!inner(name)')
				.eq('organization_id', organizationId)
				.eq('status', 'active')
				.ilike('name', `%${query}%`)
				.limit(5);

			if (brandScope) {
				productQuery = productQuery.in('brand_id', brandScope);
			}

			const { data: products } = await productQuery;
			if (!products || products.length === 0) {
				return `No products found matching "${query}".`;
			}

			return products
				.map((p: Record<string, unknown>) => {
					const brand = p.brands as Record<string, unknown> | null;
					return `${p.name} (${p.style_number ?? 'no style#'}) — ${brand?.name ?? 'unknown brand'} — $${p.wholesale_price ?? '?'}`;
				})
				.join('\n');
		}

		case 'check_order_status': {
			const orderNumber = input.order_number as string | undefined;
			const accountName = input.account_name as string | undefined;

			let orderQuery = supabaseAdmin
				.from('orders')
				.select(
					'order_number, status, created_at, accounts!inner(business_name), brands!inner(name)'
				)
				.eq('organization_id', organizationId)
				.order('created_at', { ascending: false })
				.limit(5);

			if (orderNumber) {
				orderQuery = orderQuery.eq('order_number', parseInt(orderNumber, 10));
			}
			if (accountName) {
				orderQuery = orderQuery.ilike('accounts.business_name', `%${accountName}%`);
			}

			const { data: orders } = await orderQuery;
			if (!orders || orders.length === 0) {
				return 'No orders found.';
			}

			return orders
				.map((o: Record<string, unknown>) => {
					const account = o.accounts as Record<string, unknown> | null;
					const brand = o.brands as Record<string, unknown> | null;
					const date = new Date(o.created_at as string).toLocaleDateString();
					return `#${o.order_number} — ${account?.business_name ?? '?'} / ${brand?.name ?? '?'} — ${o.status} (${date})`;
				})
				.join('\n');
		}

		case 'search_accounts': {
			const query = input.query as string;
			const { data: accounts } = await supabaseAdmin
				.from('accounts')
				.select('id, business_name, city, state')
				.eq('organization_id', organizationId)
				.ilike('business_name', `%${query}%`)
				.limit(5);

			if (!accounts || accounts.length === 0) {
				return `No accounts found matching "${query}".`;
			}

			return accounts
				.map(
					(a: Record<string, unknown>) =>
						`${a.business_name}${a.city ? ` — ${a.city}, ${a.state}` : ''}`
				)
				.join('\n');
		}

		case 'place_order': {
			const { executeToolCall } = await import('$lib/server/ai-tools.js');

			const result = await executeToolCall(
				'create_order',
				{
					...input,
					status: 'draft'
				},
				{
					supabase: supabaseAdmin,
					organizationId,
					userId,
					brandScope,
					orgType,
					origin: 'messaging'
				}
			);

			if (!result.success) {
				return `Order failed: ${result.error ?? 'Unknown error'}`;
			}

			const order = result.data as Record<string, unknown>;
			return `Draft order #${order.order_number} created for ${(order.accounts as Record<string, unknown>)?.business_name ?? input.account_name}.`;
		}

		default:
			return `Unknown tool: ${toolName}`;
	}
}

export async function runAgent(input: AgentInput): Promise<string> {
	const systemPrompt = buildSystemPrompt(input.context);
	const priorMessages = buildConversationHistory(input.conversationHistory);

	const userContent: Anthropic.ContentBlockParam[] = [];
	if (input.mediaUrl) {
		userContent.push({
			type: 'text',
			text: `[User sent an image: ${input.mediaUrl}]`
		});
	}
	userContent.push({
		type: 'text',
		text: input.newMessage || '(no text — image only)'
	});

	const messages: Anthropic.MessageParam[] = [
		...priorMessages.map((m) => ({
			role: m.role as 'user' | 'assistant',
			content: m.content
		})),
		{ role: 'user', content: userContent }
	];

	let iterations = 0;
	const maxIterations = 5;

	while (iterations < maxIterations) {
		iterations++;

		const response = await anthropic.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 1024,
			system: systemPrompt,
			tools: MESSAGING_TOOLS,
			messages
		});

		logUsage({
			endpoint: 'messaging-agent',
			purpose: 'messaging_conversation',
			model: 'claude-sonnet-4-6',
			organizationId: input.organizationId,
			userId: input.userId,
			response
		});

		if (response.stop_reason === 'tool_use') {
			const toolBlocks = response.content.filter(
				(b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
			);

			messages.push({ role: 'assistant', content: response.content });

			const toolResults: Anthropic.ToolResultBlockParam[] = [];
			for (const tool of toolBlocks) {
				const result = await executeMessagingTool(
					tool.name,
					tool.input as Record<string, unknown>,
					input.organizationId,
					input.userId,
					input.brandScope,
					input.orgType
				);
				toolResults.push({
					type: 'tool_result',
					tool_use_id: tool.id,
					content: result
				});
			}

			messages.push({ role: 'user', content: toolResults });
			continue;
		}

		const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');

		return textBlock?.text ?? "I couldn't process that. Could you try rephrasing?";
	}

	return 'I hit a processing limit. Could you try a simpler request?';
}
