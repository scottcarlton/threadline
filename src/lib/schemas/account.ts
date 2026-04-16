import { z } from 'zod';

const blankToUndef = z
	.string()
	.transform((v) => v.trim())
	.transform((v) => (v === '' ? undefined : v));

const optShortString = blankToUndef.pipe(z.string().max(255).optional()).optional();
const optLongString = blankToUndef.pipe(z.string().max(2000).optional()).optional();

const optEmail = blankToUndef
	.pipe(z.string().email('Enter a valid email address').max(255).optional())
	.optional();

const optUrl = blankToUndef
	.pipe(z.string().url('Enter a valid URL (include https://)').max(500).optional())
	.optional();

const addressSchema = z.object({
	line1: optShortString,
	line2: optShortString,
	city: optShortString,
	state: blankToUndef.pipe(z.string().max(64).optional()).optional(),
	zip: blankToUndef.pipe(z.string().max(20).optional()).optional()
});

const additionalLocationSchema = z.object({
	label: z.string().trim().min(1, 'Label is required').max(100),
	phone: optShortString,
	address: addressSchema,
	contact: z
		.object({
			firstName: optShortString,
			lastName: optShortString,
			email: optEmail
		})
		.optional()
});

export const createAccountSchema = z.object({
	business: z.object({
		name: z.string().trim().min(1, 'Business name is required').max(255),
		website: optUrl,
		phone: optShortString,
		address: addressSchema,
		additionalLocations: z.array(additionalLocationSchema).default([])
	}),
	contact: z.object({
		firstName: z.string().trim().min(1, 'First name is required').max(100),
		lastName: z.string().trim().min(1, 'Last name is required').max(100),
		email: optEmail,
		phone: optShortString
	}),
	notes: optLongString
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
