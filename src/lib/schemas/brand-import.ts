import { z } from 'zod';

// Per-row input to the bulk brand import endpoint. Mirrors the shape of
// account-import.ts: the preflight CSV preview produces rows that conform to
// this, the endpoint validates each one, dedupes by name within the org, and
// inserts what's left.
//
// Fields match what /brands/new collects, so a brand created by import and a
// brand created by hand land in the same shape.

const optTrimmedString = z.union([z.string(), z.null(), z.undefined()]).transform((v) => {
	if (v === null || v === undefined) return null;
	const trimmed = v.trim();
	return trimmed === '' ? null : trimmed;
});

export const brandDraftSchema = z.object({
	name: z.string().trim().min(1, 'name is required'),
	contact_first_name: optTrimmedString,
	contact_last_name: optTrimmedString,
	contact_email: optTrimmedString,
	contact_phone: optTrimmedString,
	website: optTrimmedString,
	notes: optTrimmedString,
	// brands.commission_rate is NOT NULL with a 0 default, so a missing column
	// imports as 0 rather than failing the row.
	commission_rate: z
		.union([z.number(), z.null(), z.undefined()])
		.transform((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0))
		.pipe(z.number().min(0).max(100))
});

export type BrandDraft = z.infer<typeof brandDraftSchema>;

export const brandImportSchema = z.object({
	brands: z.array(brandDraftSchema).min(1, 'At least one brand required')
});

export type BrandImportInput = z.infer<typeof brandImportSchema>;

export type BrandImportResult = {
	created: number;
	skipped: { name: string; reason: string }[];
	errors: { name: string; reason: string }[];
};
