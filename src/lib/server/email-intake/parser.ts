import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { createTracked } from '$lib/server/ai-usage.js';
import { wrapUntrusted, UNTRUSTED_CONTENT_RULE } from '$lib/server/ai-untrusted.js';
import { reportAiValidation } from '$lib/server/ai-errors.js';
import {
	emailOrderToolInputSchema,
	parseEmailOrderOutput,
	type ParsedOrder,
	type ParsedOrderItem
} from '$lib/schemas/email-order-extraction.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Types ────────────────────────────────────────────────

// Derived from the schema so the tool definition, the runtime check, and the
// resolver's types cannot drift apart.
export type { ParsedOrder, ParsedOrderItem };

/**
 * The model returned an order that failed the schema. Thrown so the webhook
 * sends the intake to review; already reported as a validation failure, so
 * the caller should not report it again as an exception.
 */
export class OrderExtractionInvalidError extends Error {
	constructor(readonly issues: string[]) {
		super(`Extracted order failed validation: ${issues.slice(0, 3).join('; ')}`);
		this.name = 'OrderExtractionInvalidError';
	}
}

// ── Tool schema ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You extract orders from plain-text emails for a wholesale fashion platform. The sender is a brand rep; the retailer being ordered for is the "account." Sizes are typically XS S M L XL XXL but may include numeric sizes. Dates like "5/20-6/20" or "5/20 6/20" are ship windows (start–end). If a product line contains a dash followed by a phrase (e.g. "Catya Blouse - Monarch Haze"), treat the phrase as a color. If the user writes "Brand: X" extract X into brand_name. If the user writes "Org: X" extract X into org_hint. When in doubt, prefer extracting; the downstream system will verify against the catalog.`;

const extractionTool: Anthropic.Tool = {
	name: 'extract_order',
	description: 'Extract an order from a plain-text email body.',
	input_schema: emailOrderToolInputSchema()
};

/**
 * Parse an inbound email body into a structured order using Claude.
 */
export async function parseInboundOrder(
	body: string,
	organizationId?: string | null,
	userId?: string | null
): Promise<ParsedOrder> {
	const response = await createTracked(
		anthropic,
		{
			model: 'claude-sonnet-4-6',
			max_tokens: 4096,
			system: `${SYSTEM_PROMPT}

${UNTRUSTED_CONTENT_RULE}`,
			tools: [extractionTool],
			tool_choice: { type: 'tool', name: 'extract_order' },
			messages: [
				{
					role: 'user',
					content: `Extract the order from this email.\n\n${wrapUntrusted('inbound email', body)}`
				}
			]
		},
		{
			endpoint: 'email-intake',
			purpose: 'extract_order',
			organizationId: organizationId ?? null,
			userId: userId ?? null
		}
	);

	const toolBlock = response.content.find((b) => b.type === 'tool_use');
	if (!toolBlock || toolBlock.type !== 'tool_use') {
		throw new Error('AI did not return structured order data');
	}

	const result = parseEmailOrderOutput(toolBlock.input);
	if (!result.ok) {
		reportAiValidation({
			endpoint: 'email-intake',
			purpose: 'extract_order',
			organizationId: organizationId ?? null,
			failed: 1,
			total: 1,
			issues: result.issues
		});
		throw new OrderExtractionInvalidError(result.issues);
	}
	return result.order;
}
