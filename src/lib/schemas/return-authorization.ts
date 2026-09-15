import { z } from 'zod';

/**
 * Shape and rules for creating a return authorization (SCO-184).
 *
 * One schema covers both creation modes, discriminated by `mode`, rather than a
 * discriminated union: superforms drives a single form instance and the two
 * modes share every field except which identifier is required.
 *
 * What is deliberately NOT here: `organization_id`, `brand_id` and `account_id`
 * on an order-derived return. Those are the denormalized keys every RLS read
 * policy is built on (see the returns section of the permissions map), so the
 * server derives them from the order rather than accepting them from the
 * client. A forged key cannot leak anything to the writer, but it can inject a
 * fabricated request into another org's queue.
 */

/**
 * Validated app-side rather than by a DB CHECK, matching the convention set for
 * `invoice_payments.method` in 20260419000002: this vocabulary is product copy
 * and will move.
 */
export const RETURN_REASON_CODES = [
	'damaged',
	'defective',
	'wrong_item',
	'not_as_described',
	'size_fit',
	'overstock',
	'other'
] as const;

export type ReturnReasonCode = (typeof RETURN_REASON_CODES)[number];

export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
	damaged: 'Damaged in transit',
	defective: 'Defective',
	wrong_item: 'Wrong item shipped',
	not_as_described: 'Not as described',
	size_fit: 'Size or fit',
	overstock: 'Overstock',
	other: 'Other'
};

const optId = z.string().uuid().nullable().default(null);
const optReasonCode = z.enum(RETURN_REASON_CODES).nullable().default(null);

export const returnLineSchema = z.object({
	/** Present on an order-derived line, null on a free-entry one. */
	orderLineId: optId,
	/** Resolved where the style matches the catalog. Drives restock in SCO-186. */
	variantId: optId,
	styleNumber: z.string().trim().max(100).default(''),
	description: z.string().trim().max(500).default(''),
	color: z.string().trim().max(100).default(''),
	size: z.string().trim().max(50).default(''),
	qty: z.number().int('Quantity must be a whole number').min(1, 'Quantity must be at least 1'),
	// Snapshotted from the order line, or entered by hand on a free-entry return.
	// A zero price is legitimate: samples and gratis goods come back too.
	unitPrice: z.number().min(0, 'Price cannot be negative'),
	reasonCode: optReasonCode
});

export type ReturnLineInput = z.infer<typeof returnLineSchema>;

export const createReturnSchema = z
	.object({
		mode: z.enum(['order', 'free']).default('order'),

		/** Required in `order` mode. Everything else is derived from it server-side. */
		orderId: optId,

		/** Required in `free` mode; derived from the order otherwise. */
		brandId: optId,
		accountId: optId,

		reason: z.string().trim().max(2000).default(''),
		reasonCode: optReasonCode,

		lines: z.array(returnLineSchema).min(1, 'Add at least one item to return')
	})
	.superRefine((value, ctx) => {
		if (value.mode === 'order' && !value.orderId) {
			ctx.addIssue({
				code: 'custom',
				path: ['orderId'],
				message: 'Choose the order this return is against'
			});
		}

		if (value.mode === 'free') {
			if (!value.brandId) {
				ctx.addIssue({
					code: 'custom',
					path: ['brandId'],
					message: 'Choose which brand the goods are coming back to'
				});
			}
			// A return with no account cannot be credited to anyone, and the buyer
			// INSERT policy keys on account_id, so it is required here rather than
			// left to the nullable column.
			if (!value.accountId) {
				ctx.addIssue({
					code: 'custom',
					path: ['accountId'],
					message: 'Choose the account returning the goods'
				});
			}
			// Free-entry lines have no order line to describe them, so something has
			// to identify the goods on the credit memo.
			value.lines.forEach((line, i) => {
				if (!line.styleNumber && !line.description) {
					ctx.addIssue({
						code: 'custom',
						path: ['lines', i, 'styleNumber'],
						message: 'Enter a style number or a description'
					});
				}
			});
		}
	});

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
