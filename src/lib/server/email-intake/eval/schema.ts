import { z } from 'zod';

export const ExpectedSchema = z.object({
	description: z.string(),
	tags: z.array(z.string()).min(1),

	parser: z.object({
		account_name: z.string(),
		brand_name: z.string().nullable(),
		org_hint: z.string().nullable(),
		item_count: z.number().int().min(0),
		has_ship_window: z.boolean()
	}),

	resolver: z.object({
		kind: z.enum(['resolved', 'ambiguous']),
		expected_account_name: z.string().nullable().optional(),
		expected_brand_name: z.string().nullable().optional(),
		expected_account_confidence_min: z.number().min(0).max(1).optional(),
		lines: z
			.array(
				z.object({
					expected_product_name: z.string().nullable(),
					expected_confidence_min: z.number().min(0).max(1),
					expected_sizes_with_variants: z.array(z.string())
				})
			)
			.optional()
	}),

	outcome: z.object({
		status: z.enum(['submitted', 'needs_review']),
		expected_reason_codes: z.array(z.string())
	})
});

export type Expected = z.infer<typeof ExpectedSchema>;
