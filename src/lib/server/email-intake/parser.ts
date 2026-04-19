import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { logUsage } from '$lib/server/ai-usage.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Types ────────────────────────────────────────────────────

export type ParsedOrderItem = {
	raw_text: string;
	product_name: string;
	color: string | null;
	sizes: Array<{ size: string; qty: number }>;
};

export type ParsedOrder = {
	account_name: string;
	brand_name: string | null;
	org_hint: string | null;
	ship_window: { start: string | null; end: string | null } | null;
	notes: string | null;
	items: ParsedOrderItem[];
};

// ── Tool schema ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You extract orders from plain-text emails for a wholesale fashion platform. The sender is a brand rep; the retailer being ordered for is the "account." Sizes are typically XS S M L XL XXL but may include numeric sizes. Dates like "5/20-6/20" or "5/20 6/20" are ship windows (start–end). If a product line contains a dash followed by a phrase (e.g. "Catya Blouse - Monarch Haze"), treat the phrase as a color. If the user writes "Brand: X" extract X into brand_name. If the user writes "Org: X" extract X into org_hint. When in doubt, prefer extracting; the downstream system will verify against the catalog.`;

const extractionTool: Anthropic.Tool = {
	name: 'extract_order',
	description: 'Extract an order from a plain-text email body.',
	input_schema: {
		type: 'object' as const,
		properties: {
			account_name: {
				type: 'string',
				description: 'Retailer/buyer name (e.g. "Bloom Boutique").'
			},
			brand_name: {
				type: ['string', 'null'] as unknown as 'string',
				description: 'Brand if explicitly stated; null if not mentioned.'
			},
			org_hint: {
				type: ['string', 'null'] as unknown as 'string',
				description: 'If the email says "Org: X", return X.'
			},
			ship_window: {
				type: ['object', 'null'] as unknown as 'object',
				properties: {
					start: {
						type: ['string', 'null'] as unknown as 'string',
						description: 'ISO date or null'
					},
					end: { type: ['string', 'null'] as unknown as 'string', description: 'ISO date or null' }
				}
			},
			notes: {
				type: ['string', 'null'] as unknown as 'string',
				description: 'Free-form notes from the email.'
			},
			items: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						raw_text: { type: 'string', description: 'The original line from the email.' },
						product_name: { type: 'string', description: 'Product name extracted.' },
						color: {
							type: ['string', 'null'] as unknown as 'string',
							description: 'Color if present.'
						},
						sizes: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									size: { type: 'string' },
									qty: { type: 'integer' }
								},
								required: ['size', 'qty']
							}
						}
					},
					required: ['raw_text', 'product_name', 'sizes']
				}
			}
		},
		required: ['account_name', 'items']
	}
};

/**
 * Parse an inbound email body into a structured order using Claude.
 */
export async function parseInboundOrder(
	body: string,
	organizationId?: string | null,
	userId?: string | null
): Promise<ParsedOrder> {
	const response = await anthropic.messages.create({
		model: 'claude-sonnet-4-6',
		max_tokens: 4096,
		system: SYSTEM_PROMPT,
		tools: [extractionTool],
		tool_choice: { type: 'tool', name: 'extract_order' },
		messages: [
			{
				role: 'user',
				content: `Extract the order from this email:\n\n${body}`
			}
		]
	});

	logUsage({
		endpoint: 'email-intake',
		purpose: 'extract_order',
		model: 'claude-sonnet-4-6',
		organizationId: organizationId ?? null,
		userId: userId ?? null,
		response
	});

	const toolBlock = response.content.find((b) => b.type === 'tool_use');
	if (!toolBlock || toolBlock.type !== 'tool_use') {
		throw new Error('AI did not return structured order data');
	}

	const input = toolBlock.input as ParsedOrder;
	return {
		account_name: input.account_name,
		brand_name: input.brand_name ?? null,
		org_hint: input.org_hint ?? null,
		ship_window: input.ship_window ?? null,
		notes: input.notes ?? null,
		items: (input.items ?? []).map((item) => ({
			raw_text: item.raw_text,
			product_name: item.product_name,
			color: item.color ?? null,
			sizes: item.sizes ?? []
		}))
	};
}
