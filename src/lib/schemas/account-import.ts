import { z } from 'zod';

// Per-row input to the bulk account import endpoint. The CSV preview
// flow produces shapes that conform to this. Endpoint validates each
// row, dedupes by business_name within the org, inserts fresh rows.

const optTrimmedString = z.union([z.string(), z.null(), z.undefined()]).transform((v) => {
	if (v === null || v === undefined) return null;
	const trimmed = v.trim();
	return trimmed === '' ? null : trimmed;
});

export const accountDraftSchema = z.object({
	business_name: z.string().trim().min(1, 'business_name is required'),
	contact_first_name: optTrimmedString,
	contact_last_name: optTrimmedString,
	contact_email: optTrimmedString,
	phone: optTrimmedString,
	address_line1: optTrimmedString,
	city: optTrimmedString,
	state: optTrimmedString,
	zip: optTrimmedString
});

export type AccountDraft = z.infer<typeof accountDraftSchema>;

export const accountImportSchema = z.object({
	accounts: z.array(accountDraftSchema).min(1, 'At least one account required')
});

export type AccountImportInput = z.infer<typeof accountImportSchema>;

export type AccountImportResult = {
	created: number;
	skipped: { business_name: string; reason: string }[];
	errors: { business_name: string; reason: string }[];
};
