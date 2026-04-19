import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { LINESHEET_PROMPT } from '$lib/server/ai-prompts.js';
import { logUsage } from '$lib/server/ai-usage.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const ALLOWED_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'application/pdf'
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const SYSTEM_PROMPT = LINESHEET_PROMPT;

// Define a tool so Claude returns structured JSON via tool_use (guaranteed valid)
const extractionTool: Anthropic.Tool = {
	name: 'parse_products',
	description: 'Parse and return the extracted products from the linesheet.',
	input_schema: {
		type: 'object' as const,
		properties: {
			season: {
				type: 'string',
				description:
					'Season name detected on the linesheet (e.g. "Spring", "Fall", "Resort", "Pre-Fall"). Omit if not confident.'
			},
			year: {
				type: 'number',
				description:
					'Four-digit year detected on the linesheet (e.g. 2026). Expand shorthand like "FW25" → 2025. Omit if not confident.'
			},
			products: {
				type: 'array',
				description: 'Array of products extracted from the linesheet',
				items: {
					type: 'object',
					properties: {
						style_number: { type: 'string', description: 'Style number, SKU, or item code' },
						name: { type: 'string', description: 'Product name or description' },
						wholesale_price: { type: 'number', description: 'Wholesale price as a decimal number' },
						retail_price: { type: 'number', description: 'Retail/MSRP price if shown' },
						category: {
							type: 'string',
							description: 'Product category (e.g., Tops, Bottoms, Dresses)'
						},
						description: { type: 'string', description: 'Additional product description' },
						sizes: {
							type: 'array',
							items: { type: 'string' },
							description: 'Available sizes (e.g., ["XS", "S", "M", "L", "XL"])'
						},
						colors: {
							type: 'array',
							items: { type: 'string' },
							description: 'Available colors (e.g., ["Black", "Navy", "White"])'
						}
					},
					required: ['style_number', 'name', 'wholesale_price']
				}
			}
		},
		required: ['products']
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	if (!file) {
		return json({ error: 'Missing file' }, { status: 400 });
	}

	if (!ALLOWED_TYPES.has(file.type)) {
		return json(
			{ error: 'Unsupported file type. Please upload a PDF, JPG, PNG, or WebP file.' },
			{ status: 400 }
		);
	}

	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File is too large. Maximum size is 20MB.' }, { status: 400 });
	}

	const arrayBuffer = await file.arrayBuffer();
	const base64 = Buffer.from(arrayBuffer).toString('base64');
	const isPdf = file.type === 'application/pdf';

	const content: Anthropic.ContentBlockParam[] = isPdf
		? [
				{
					type: 'document',
					source: {
						type: 'base64',
						media_type: 'application/pdf',
						data: base64
					}
				} as unknown as Anthropic.ContentBlockParam,
				{
					type: 'text',
					text: 'Extract all products from this linesheet. You MUST call the parse_products tool with the results.'
				}
			]
		: [
				{
					type: 'image',
					source: {
						type: 'base64',
						media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
						data: base64
					}
				},
				{
					type: 'text',
					text: 'Extract all products from this linesheet. You MUST call the parse_products tool with the results.'
				}
			];

	try {
		const response = await anthropic.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 16384,
			system: SYSTEM_PROMPT,
			tools: [extractionTool],
			tool_choice: { type: 'tool', name: 'parse_products' },
			messages: [{ role: 'user', content }]
		});
		logUsage({
			endpoint: 'linesheet',
			purpose: 'parse_products',
			model: 'claude-sonnet-4-6',
			organizationId: locals.organization?.id ?? null,
			userId: locals.user?.id ?? null,
			response
		});

		// Find the tool_use block — guaranteed to be valid structured JSON
		const toolBlock = response.content.find((b) => b.type === 'tool_use');
		if (!toolBlock || toolBlock.type !== 'tool_use') {
			return json(
				{ error: 'AI did not return product data. Try a clearer image or use CSV import.' },
				{ status: 422 }
			);
		}

		const input = toolBlock.input as {
			products?: Record<string, unknown>[];
			season?: unknown;
			year?: unknown;
		};
		const products = input.products;

		if (!Array.isArray(products) || products.length === 0) {
			return json(
				{ error: 'No products found in this file. Try a clearer image or use CSV import.' },
				{ status: 422 }
			);
		}

		// Normalize each product
		const normalized = products.map((p) => ({
			style_number: String(p.style_number ?? '').trim(),
			name: String(p.name ?? '').trim(),
			wholesale_price: String(Number(p.wholesale_price) || 0),
			retail_price: p.retail_price != null ? String(Number(p.retail_price) || '') : '',
			category: p.category ? String(p.category).trim() : '',
			description: p.description ? String(p.description).trim() : '',
			sizes: Array.isArray(p.sizes) ? p.sizes.map(String) : [],
			colors: Array.isArray(p.colors) ? p.colors.map(String) : []
		}));

		const seasonHint =
			typeof input.season === 'string' && input.season.trim() ? input.season.trim() : null;
		const yearHint =
			typeof input.year === 'number' && Number.isFinite(input.year) ? Math.trunc(input.year) : null;

		return json({ products: normalized, season: seasonHint, year: yearHint });
	} catch (err) {
		console.error('Linesheet parse error:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Could not process') || message.includes('image')) {
			return json(
				{
					error: "Could not process this file. Make sure it's a clear image or PDF of a linesheet."
				},
				{ status: 422 }
			);
		}
		return json({ error: 'Failed to analyze linesheet. Please try again.' }, { status: 500 });
	}
};
