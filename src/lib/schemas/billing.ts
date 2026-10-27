import { z } from 'zod';
import { PLAN_KEYS } from '$lib/billing/plans.js';

export const checkoutSchema = z.object({
	plan: z.enum(PLAN_KEYS)
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
