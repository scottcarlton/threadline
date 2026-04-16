import { z } from 'zod';
import { PHONE_REGEX } from '$lib/utils/phone';

const optShortString = z.string().trim().max(255).default('');

const optPhone = z
	.union([z.literal(''), z.string().regex(PHONE_REGEX, 'Enter a valid 10-digit phone number')])
	.default('');
const optLongString = z.string().trim().max(2000).default('');
const optStateString = z.string().trim().max(64).default('');
const optZipString = z.string().trim().max(20).default('');

const optEmail = z
	.union([z.literal(''), z.string().trim().email('Enter a valid email address').max(255)])
	.default('');

const optUrl = z
	.union([z.literal(''), z.string().trim().url('Enter a valid URL (include https://)').max(500)])
	.default('');

const addressSchema = z.object({
	line1: optShortString,
	line2: optShortString,
	city: optShortString,
	state: optStateString,
	zip: optZipString
});

const additionalLocationSchema = z.object({
	label: z.string().trim().min(1, 'Label is required').max(100),
	phone: optPhone,
	address: addressSchema,
	contact: z.object({
		firstName: optShortString,
		lastName: optShortString,
		email: optEmail
	})
});

export const createAccountSchema = z.object({
	business: z.object({
		name: z.string().trim().min(1, 'Business name is required').max(255),
		website: optUrl,
		phone: optPhone,
		address: addressSchema,
		additionalLocations: z.array(additionalLocationSchema).default([])
	}),
	contact: z.object({
		firstName: z.string().trim().min(1, 'First name is required').max(100),
		lastName: z.string().trim().min(1, 'Last name is required').max(100),
		email: optEmail,
		phone: optPhone
	}),
	notes: optLongString
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
