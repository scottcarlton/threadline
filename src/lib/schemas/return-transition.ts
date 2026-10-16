import { z } from 'zod';

/**
 * Declining a return. The reason is required, not optional: the requester has
 * to learn why, and a silent decline is how a buyer ends up phoning their rep
 * to ask what happened. decideTransition() enforces the same rule server-side.
 */
export const declineReturnSchema = z.object({
	reason: z
		.string()
		.trim()
		.min(1, 'Say why, so the requester knows what happened')
		.max(500, 'Keep it under 500 characters')
});

export type DeclineReturnInput = z.infer<typeof declineReturnSchema>;

/**
 * Receiving a return. One disposition per line, every line. Completeness and
 * the line ids are checked server-side against the return itself by
 * validateDispositions(); this only shapes what the form may send.
 */
export const receiveReturnSchema = z.object({
	dispositions: z
		.array(
			z.object({
				lineId: z.string().uuid(),
				disposition: z.enum(['restock', 'damaged', 'destroy'])
			})
		)
		.max(500)
});

export type ReceiveReturnInput = z.infer<typeof receiveReturnSchema>;

const deduction = (label: string) =>
	z.coerce
		.number({ message: `Enter the ${label}, or 0` })
		.min(0, `The ${label} cannot be negative`)
		.max(99_999_999, 'That amount looks wrong');

/**
 * Issuing the credit memo. Only the three amounts the brand may override; the
 * subtotal, applied invoice and total are derived by issue_credit_memo().
 */
export const issueCreditMemoSchema = z.object({
	restockingFee: deduction('restocking fee'),
	shippingDeduction: deduction('shipping deduction'),
	creditTax: deduction('tax')
});

export type IssueCreditMemoInput = z.infer<typeof issueCreditMemoSchema>;
