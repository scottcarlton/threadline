import { z } from 'zod';

// Shape of the `parse_products` tool the linesheet extractor forces the model
// to call. One schema drives both directions: `linesheetToolInputSchema`
// renders the JSON Schema the model sees, and `parseLinesheetOutput` checks
// what comes back.
//
// Required fields fail the row. A row the model could not read (no price, no
// style number) is reported as unreadable rather than defaulted: the old
// `Number(price) || 0` turned every smudged price into a $0 product.
// Optional fields degrade to absent instead, so a garbled retail price does
// not cost the user the whole style.

const optionalNumber = (description: string) =>
	z.number().nonnegative().optional().catch(undefined).describe(description);

const optionalString = (description: string) =>
	z.string().trim().optional().catch(undefined).describe(description);

const optionalYear = (description: string) =>
	z.number().int().min(1900).max(2200).optional().catch(undefined).describe(description);

const optionalStringList = (description: string) =>
	z.array(z.string()).optional().catch(undefined).describe(description);

export const linesheetProductSchema = z.object({
	style_number: z.string().trim().min(1).describe('Style number, SKU, or item code'),
	name: z.string().trim().min(1).describe('Product name or description'),
	wholesale_price: z.number().nonnegative().describe('Wholesale price as a decimal number'),
	retail_price: optionalNumber('Retail/MSRP price if shown'),
	category: optionalString('Product category (e.g., Tops, Bottoms, Dresses)'),
	subcategory: optionalString(
		"Product subcategory if shown, e.g. 'Knits' under 'Tops'. Omit if not confident."
	),
	product_year: optionalYear(
		"Four-digit year if shown per-product, separate from the linesheet-level `year`. Omit if the row doesn't carry its own year."
	),
	description: optionalString('Additional product description'),
	sizes: optionalStringList('Available sizes (e.g., ["XS", "S", "M", "L", "XL"])'),
	colors: optionalStringList('Available colors (e.g., ["Black", "Navy", "White"])')
});

const season = optionalString(
	'Season name detected on the linesheet (e.g. "Spring", "Fall", "Resort", "Pre-Fall"). Omit if not confident.'
);
const year = optionalYear(
	'Four-digit year detected on the linesheet (e.g. 2026). Expand shorthand like "FW25" → 2025. Omit if not confident.'
);

const toolSchema = z.object({
	season,
	year,
	products: z
		.array(linesheetProductSchema)
		.describe('Array of products extracted from the linesheet')
});

/** JSON Schema for the tool definition, without the `$schema` marker. */
export function linesheetToolInputSchema() {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { $schema, ...schema } = z.toJSONSchema(toolSchema, { io: 'input' });
	return schema as { type: 'object'; [key: string]: unknown };
}

export type LinesheetProduct = z.infer<typeof linesheetProductSchema>;

export type UnreadableRow = {
	/** Zero-based position in the model's output, for logs. */
	index: number;
	style_number: string | null;
	name: string | null;
	issues: string[];
};

export type LinesheetParseResult = {
	season: string | null;
	year: number | null;
	products: LinesheetProduct[];
	unreadable: UnreadableRow[];
};

// The envelope is checked loosely so one bad row cannot sink the rest; each
// row is then checked on its own.
const envelopeSchema = z.object({
	season,
	year,
	products: z.array(z.unknown()).catch([])
});

function textField(row: unknown, key: string): string | null {
	if (!row || typeof row !== 'object') return null;
	const value = (row as Record<string, unknown>)[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Validate the `parse_products` tool input, row by row. */
export function parseLinesheetOutput(input: unknown): LinesheetParseResult {
	const envelope = envelopeSchema.safeParse(input);
	const rows = envelope.success ? envelope.data.products : [];

	const products: LinesheetProduct[] = [];
	const unreadable: UnreadableRow[] = [];

	rows.forEach((row, index) => {
		const parsed = linesheetProductSchema.safeParse(row);
		if (parsed.success) {
			products.push(parsed.data);
			return;
		}
		unreadable.push({
			index,
			style_number: textField(row, 'style_number'),
			name: textField(row, 'name'),
			issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
		});
	});

	return {
		season: envelope.success ? (envelope.data.season ?? null) || null : null,
		year: envelope.success ? (envelope.data.year ?? null) : null,
		products,
		unreadable
	};
}
