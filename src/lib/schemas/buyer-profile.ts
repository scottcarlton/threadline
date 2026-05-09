import { z } from 'zod';
import { PHONE_REGEX } from '$lib/utils/phone';

export const buyerProfileSchema = z.object({
	displayName: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
	phone: z
		.union([z.literal(''), z.string().regex(PHONE_REGEX, 'Enter a valid 10-digit phone number')])
		.default('')
});

export type BuyerProfileInput = z.infer<typeof buyerProfileSchema>;
