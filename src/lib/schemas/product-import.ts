import { z } from 'zod';

// Per-row input to the bulk product import endpoint. Both the PDF AI
// extractor and the CSV mapper produce shapes that conform to this — see
// /api/products/parse-linesheet/+server.ts for the AI side and
// CsvColumnMapper.svelte for the CSV side. The endpoint validates each
// row against this before any DB write.

const optTrimmedString = z.union([z.string(), z.null(), z.undefined()]).transform((v) => {
	if (v === null || v === undefined) return null;
	const trimmed = v.trim();
	return trimmed === '' ? null : trimmed;
});

const optNonNegativeNumber = z
	.union([z.number(), z.string(), z.null(), z.undefined()])
	.transform((v) => {
		if (v === null || v === undefined || v === '') return null;
		const n = typeof v === 'string' ? Number(v) : v;
		return Number.isFinite(n) && n >= 0 ? n : null;
	});

const optYear = z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((v) => {
	if (v === null || v === undefined || v === '') return null;
	const n = typeof v === 'string' ? Number(v) : v;
	if (!Number.isFinite(n)) return null;
	const trunc = Math.trunc(n);
	return trunc >= 1900 && trunc <= 2200 ? trunc : null;
});

// sizes / colors come in as either:
//   - already-split arrays (PDF AI path)
//   - comma- or semicolon-separated strings (CSV path)
// Normalize both to a clean string[] of unique non-empty values.
const flexibleStringArray = z
	.union([z.array(z.string()), z.string(), z.null(), z.undefined()])
	.transform((v) => {
		if (Array.isArray(v)) {
			return Array.from(new Set(v.map((s) => s.trim()).filter((s) => s.length > 0)));
		}
		if (typeof v === 'string') {
			return Array.from(
				new Set(
					v
						.split(/[,;|]/)
						.map((s) => s.trim())
						.filter((s) => s.length > 0)
				)
			);
		}
		return [];
	});

export const productDraftSchema = z.object({
	style_number: z.string().trim().min(1, 'style_number is required'),
	name: z.string().trim().min(1, 'name is required'),
	wholesale_price: z.coerce
		.number({ message: 'wholesale_price must be a number' })
		.min(0, 'wholesale_price must be 0 or more'),
	retail_price: optNonNegativeNumber,
	category: optTrimmedString,
	subcategory: optTrimmedString,
	description: optTrimmedString,
	sizes: flexibleStringArray,
	colors: flexibleStringArray,
	season_id: z.union([z.string().uuid(), z.null(), z.undefined()]).transform((v) => v ?? null),
	product_year: optYear,
	image_url: optTrimmedString
});

export type ProductDraft = z.infer<typeof productDraftSchema>;

export const productImportSchema = z.object({
	brandId: z.string().uuid(),
	onConflict: z.enum(['skip', 'replace']).default('skip'),
	products: z.array(productDraftSchema).min(1, 'At least one product required')
});

export type ProductImportInput = z.infer<typeof productImportSchema>;

export type ProductImportResult = {
	inserted: number;
	skipped: number;
	updated: number;
	imageFailures: { style_number: string; reason: string }[];
};
