import { z } from 'zod';
import { isPaymentMethodCode, isPaymentTermCode } from '$lib/payment-methods';

export const SHIPPING_METHODS = ['ground', 'air', 'freight', 'ltl', 'other'] as const;
export type ShippingMethodCode = (typeof SHIPPING_METHODS)[number];

const SHIPPING_METHOD_SET = new Set<string>(SHIPPING_METHODS);

const nullableMethod = z
	.string()
	.nullable()
	.refine((v) => v === null || isPaymentMethodCode(v), 'Invalid payment method');
const nullableTerm = z
	.string()
	.nullable()
	.refine((v) => v === null || isPaymentTermCode(v), 'Invalid payment terms');
const nullableShipping = z
	.string()
	.nullable()
	.refine((v) => v === null || SHIPPING_METHOD_SET.has(v), 'Invalid shipping method');

const uuidOrNull = z.string().uuid().nullable();

const trimmedOptional = (max: number, field = 'Field') =>
	z
		.string()
		.trim()
		.max(max, `${field} must be ${max} characters or fewer`)
		.optional()
		.transform((v) => (v && v.length ? v : undefined));

// Per-order override block. Keyed by (brand_id, season_id) to match the
// cart grouping. A null field means "inherit from the account/org default";
// validation stays loose (no required fields) because per-order overrides
// are opt-in.
export const perOrderOverrideSchema = z.object({
	brand_id: z.string().uuid(),
	season_id: uuidOrNull,
	ship_to_location_id: uuidOrNull,
	// null ⇒ bill-to follows ship-to (derived at render time).
	bill_to_location_id: uuidOrNull,
	payment_preference: nullableMethod,
	payment_terms: nullableTerm,
	shipping_method: nullableShipping,
	po_number: trimmedOptional(64, 'PO number'),
	internal_note: trimmedOptional(2000, 'Internal note')
});

export type PerOrderOverride = z.infer<typeof perOrderOverrideSchema>;

// One row per distinct brand in the cart. `terms_id` is null when the
// brand has no current brand_terms row on file; such brands do not gate
// submission. `agreed` must be true to submit when terms_id is set.
export const brandAgreementSchema = z.object({
	brand_id: z.string().uuid(),
	terms_id: uuidOrNull,
	agreed: z.boolean()
});

export type BrandAgreement = z.infer<typeof brandAgreementSchema>;

export const finalizeSchema = z
	.object({
		submit_mode: z.enum(['note', 'order']),

		// Cart-wide fields. account_id can be null for freeform notes (which
		// the UI forces to submit_mode = 'note' via DB constraint).
		account_id: uuidOrNull,
		freeform_name: trimmedOptional(120, 'Freeform name'),
		contact_location_id: uuidOrNull,
		rep_user_id: z.string().uuid(),
		source_type_id: uuidOrNull,

		// One override block per cart group.
		orders: z.array(perOrderOverrideSchema).min(1, 'Cart must contain at least one order'),

		// One agreement row per distinct brand in the cart.
		brand_agreements: z.array(brandAgreementSchema)
	})
	.superRefine((data, ctx) => {
		if (data.submit_mode === 'order') {
			for (const ba of data.brand_agreements) {
				if (ba.terms_id && !ba.agreed) {
					ctx.addIssue({
						code: 'custom',
						path: ['brand_agreements'],
						message: "Agree to each brand's terms before submitting."
					});
					break;
				}
			}
		}

		// Freeform (no-account) orders can only be saved as notes. DB-level
		// constraint `orders_freeform_only_draft` enforces this too; we mirror
		// the check here so the error is inline rather than a 500.
		if (data.submit_mode === 'order' && !data.account_id) {
			ctx.addIssue({
				code: 'custom',
				path: ['account_id'],
				message: 'Freeform orders without an account can only be saved as notes.'
			});
		}
	});

export type FinalizeInput = z.infer<typeof finalizeSchema>;
