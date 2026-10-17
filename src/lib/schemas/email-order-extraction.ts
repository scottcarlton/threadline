import { z } from 'zod';

// Shape of the `extract_order` tool the email intake parser forces the model
// to call. One schema renders the JSON Schema the model sees and checks what
// comes back. Unlike a line sheet, an order is all or nothing: dropping one
// bad line would submit a quietly different order, so any failure sends the
// whole intake to review.

const nullableText = (description: string) =>
	z
		.string()
		.trim()
		.nullish()
		.transform((v) => (v ? v : null))
		.describe(description);

const sizeQuantity = z.object({
	size: z.string().trim().min(1),
	qty: z.number().int().nonnegative()
});

export const emailOrderItemSchema = z.object({
	raw_text: z.string().describe('The original line from the email.'),
	product_name: z.string().trim().min(1).describe('Product name extracted.'),
	color: nullableText('Color if present.'),
	sizes: z.array(sizeQuantity)
});

export const emailOrderSchema = z.object({
	account_name: z.string().trim().min(1).describe('Retailer/buyer name (e.g. "Bloom Boutique").'),
	brand_name: nullableText('Brand if explicitly stated; null if not mentioned.'),
	org_hint: nullableText('If the email says "Org: X", return X.'),
	ship_window: z
		.object({
			start: nullableText('ISO date or null'),
			end: nullableText('ISO date or null')
		})
		.nullish()
		.transform((v) => v ?? null),
	notes: nullableText('Free-form notes from the email.'),
	items: z.array(emailOrderItemSchema)
});

export type ParsedOrder = z.output<typeof emailOrderSchema>;
export type ParsedOrderItem = z.output<typeof emailOrderItemSchema>;

/** JSON Schema for the tool definition, without the `$schema` marker. */
export function emailOrderToolInputSchema() {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { $schema, ...schema } = z.toJSONSchema(emailOrderSchema, { io: 'input' });
	return schema as { type: 'object'; [key: string]: unknown };
}

export type EmailOrderParseResult =
	| { ok: true; order: ParsedOrder }
	| { ok: false; issues: string[] };

export function parseEmailOrderOutput(input: unknown): EmailOrderParseResult {
	const parsed = emailOrderSchema.safeParse(input);
	if (parsed.success) return { ok: true, order: parsed.data };
	return {
		ok: false,
		issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
	};
}
