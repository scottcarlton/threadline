import { z } from 'zod';

// Per-row input to the bulk order import endpoint. The CSV preview
// flow produces shapes that conform to this. Endpoint resolves account
// (by business_name) and product (by style_number within self-brand)
// per row, skipping rows whose references don't match.

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

const positiveInt = z.union([z.number(), z.string()]).transform((v) => {
	const n = typeof v === 'string' ? Number(v) : v;
	if (!Number.isFinite(n)) return NaN;
	const i = Math.trunc(n);
	return i;
});

export const orderRowDraftSchema = z.object({
	account: z.string().trim().min(1, 'account is required'),
	style_number: z.string().trim().min(1, 'style_number is required'),
	qty: positiveInt.refine((n) => Number.isFinite(n) && n > 0, {
		message: 'qty must be a positive integer'
	}),
	unit_price: optNonNegativeNumber,
	color: optTrimmedString,
	size: optTrimmedString,
	expected_ship_date: optTrimmedString,
	notes: optTrimmedString
});

export type OrderRowDraft = z.infer<typeof orderRowDraftSchema>;

export const orderImportSchema = z.object({
	rows: z.array(orderRowDraftSchema).min(1, 'At least one row required')
});

export type OrderImportInput = z.infer<typeof orderImportSchema>;

export type OrderImportResult = {
	created: number;
	linesCreated: number;
	skipped: { row: number; reason: string }[];
	errors: { row: number; reason: string }[];
};
