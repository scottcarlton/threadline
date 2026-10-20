import { z } from 'zod';
import { finalizeSchema } from '$lib/schemas/order-finalize';

// Shape of the `payload` field posted by /orders/new, /products/order and
// /shop/checkout to the shared submitOrder action. finalizeSchema covers the
// Finalize step; this covers everything around it. Shape only: whether each
// referenced ID is one the writer may use is decided in authorizeSubmitPayload.

const uuid = z.string().uuid();
const uuidOrNull = uuid.nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null);

export const cartLineSchema = z.object({
	product_id: uuid,
	brand_id: uuid,
	season_id: uuidOrNull,
	// style_number, description and unit_price are accepted for compatibility
	// with existing clients but never trusted: the server reads all three from
	// the product row.
	style_number: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	unit_price: z.number().optional(),
	color: optionalText(64),
	size: optionalText(32),
	qty: z.number().int().positive().max(100_000)
});

const deliveryChoiceSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('delivery'), delivery_id: uuid }),
	z.object({ kind: z.literal('custom'), start_ship_date: isoDate, expected_ship_date: isoDate })
]);

const freeformDetailsSchema = z.object({
	business_name: z.string().trim().min(1).max(200),
	contact_first_name: z.string().trim().max(100).default(''),
	contact_last_name: z.string().trim().max(100).default(''),
	contact_email: z.string().trim().max(254).default(''),
	phone: z.string().trim().max(40).default(''),
	address_line1: z.string().trim().max(200).default(''),
	city: z.string().trim().max(100).default(''),
	state: z.string().trim().max(100).default(''),
	zip: z.string().trim().max(20).default('')
});

// Statuses a writer may create an order in. Fulfillment statuses are set later
// by the brand through the status endpoint, never at creation.
export const SUBMIT_STATUSES = ['draft', 'submitted', 'confirmed'] as const;

export const submitPayloadSchema = z.object({
	// One per checkout, reused on every retry. Order ids are derived from it,
	// so a resubmitted checkout replays instead of duplicating (SCO-204).
	submission_id: uuid.optional(),
	type: z.enum(['order', 'note']),
	account_id: uuidOrNull,
	freeform_name: optionalText(120),
	freeformDetails: freeformDetailsSchema.optional(),
	order_year: z.number().int().min(2000).max(2100).nullable(),
	submitStatus: z.enum(SUBMIT_STATUSES),
	payment_preference: optionalText(64),
	lines: z.array(cartLineSchema).min(1, 'An order needs at least one item.').max(2000),
	groups: z
		.array(
			z.object({
				brand_id: uuid,
				season_id: uuidOrNull,
				delivery: deliveryChoiceSchema.nullable(),
				location_id: uuidOrNull
			})
		)
		.max(200),
	finalize: finalizeSchema.nullable().optional()
});

export type SubmitPayload = z.infer<typeof submitPayloadSchema>;
