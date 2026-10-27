import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { LINESHEET_PROMPT } from '$lib/server/ai-prompts.js';
import { createTracked } from '$lib/server/ai-usage.js';
import { checkAiLimits } from '$lib/server/ai-limits.js';
import { reportAiError, reportAiValidation } from '$lib/server/ai-errors.js';
import {
	linesheetToolInputSchema,
	parseLinesheetOutput
} from '$lib/schemas/linesheet-extraction.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// PDF-only as of the linesheet uploader rewrite. Image formats were dropped:
// a photo of one product belongs in the regular product creation flow, and
// a screenshot of a printed linesheet OCRs worse than the source PDF — both
// inflate AI cost without lifting accuracy. CSVs route through the new
// mapping path and never hit this endpoint.
const ALLOWED_TYPES = new Set(['application/pdf']);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const SYSTEM_PROMPT = LINESHEET_PROMPT;

// The tool forces structured output; its schema and the validation of what
// comes back share one definition in linesheet-extraction.ts.
const extractionTool: Anthropic.Tool = {
	name: 'parse_products',
	description: 'Parse and return the extracted products from the linesheet.',
	input_schema: linesheetToolInputSchema()
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
		return json({ error: 'Unsupported file type. Upload a PDF.' }, { status: 400 });
	}

	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File is too large. Maximum size is 20MB.' }, { status: 400 });
	}

	// Checked after the cheap validations, so a rejected upload does not consume
	// a slot. This is the most expensive AI call we make: 16384 max_tokens.
	const limit = await checkAiLimits(locals.organization.id, locals.user.id, 'linesheet');
	if (!limit.allowed) {
		locals.audit.record('assistant.rate_limited', {
			status: 'failure',
			errorMessage: limit.scope,
			metadata: { endpoint: 'linesheet', scope: limit.scope }
		});
		return json(
			{ error: limit.message },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	const arrayBuffer = await file.arrayBuffer();
	const base64 = Buffer.from(arrayBuffer).toString('base64');

	const content: Anthropic.ContentBlockParam[] = [
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
	];

	try {
		const response = await createTracked(
			anthropic,
			{
				model: 'claude-sonnet-5-5',
				max_tokens: 16384,
				output_config: { effort: 'low' },
				system: SYSTEM_PROMPT,
				// Sonnet 5.5 rejects a forced tool_choice. The user message asks for
				// the call, and a reply without one returns 422 below as before.
				tools: [extractionTool],
				messages: [{ role: 'user', content }]
			},
			{
				endpoint: 'linesheet',
				purpose: 'parse_products',
				organizationId: locals.organization?.id ?? null,
				userId: locals.user?.id ?? null
			}
		);

		// A tool call means valid JSON, not valid data. The schema check
		// below is what decides whether a row is usable.
		const toolBlock = response.content.find((b) => b.type === 'tool_use');
		if (!toolBlock || toolBlock.type !== 'tool_use') {
			return json(
				{ error: 'AI did not return product data. Try a clearer PDF or use CSV import.' },
				{ status: 422 }
			);
		}

		const parsed = parseLinesheetOutput(toolBlock.input);
		reportAiValidation({
			endpoint: 'linesheet',
			purpose: 'parse_products',
			organizationId: locals.organization.id,
			failed: parsed.unreadable.length,
			total: parsed.products.length + parsed.unreadable.length,
			issues: parsed.unreadable.flatMap((row) => row.issues.map((i) => `row ${row.index}: ${i}`))
		});

		if (parsed.products.length === 0) {
			return json(
				{
					error:
						parsed.unreadable.length > 0
							? "Couldn't read the price, style number, or name on any style in this file. Check the line sheet or use CSV import."
							: 'No products found in this file. Try a clearer PDF or use CSV import.'
				},
				{ status: 422 }
			);
		}

		// Same string-typed shape the import screens already consume.
		const normalized = parsed.products.map((p) => ({
			style_number: p.style_number,
			name: p.name,
			wholesale_price: String(p.wholesale_price),
			retail_price: p.retail_price != null ? String(p.retail_price) : '',
			category: p.category ?? '',
			subcategory: p.subcategory ?? '',
			product_year: p.product_year ?? null,
			description: p.description ?? '',
			sizes: p.sizes ?? [],
			colors: p.colors ?? []
		}));

		return json({
			products: normalized,
			season: parsed.season,
			year: parsed.year,
			// Rows left out because a required field was unreadable. The import
			// screens say so instead of importing them at $0.
			unreadable: parsed.unreadable.length
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		// An unreadable upload is the user's file, not our bug. Keep it out of
		// Sentry so real failures are not buried under bad PDFs.
		if (message.includes('Could not process') || message.includes('image')) {
			console.warn('Linesheet rejected as unreadable:', message);
			return json(
				{ error: "Could not process this file. Make sure it's a clear PDF of a linesheet." },
				{ status: 422 }
			);
		}
		reportAiError(err, {
			endpoint: 'linesheet',
			purpose: 'parse_products',
			organizationId: locals.organization.id
		});
		return json({ error: 'Failed to analyze linesheet. Please try again.' }, { status: 500 });
	}
};
