import { z } from 'zod';
import { PHONE_REGEX } from '$lib/utils/phone';
import { isValidWebsite, stripProtocol } from '$lib/utils/website';

const optShortString = z.string().trim().max(255).default('');
const optLongString = z.string().trim().max(2000).default('');

const optEmail = z
	.union([z.literal(''), z.string().trim().email('Enter a valid email address').max(255)])
	.default('');

// Website is stored protocol-less (`yourbrand.com`). Either form is accepted
// from the user; the protocol is stripped before save and re-added at render
// time via `withProtocol`.
const optUrl = z
	.union([
		z.literal(''),
		z
			.string()
			.trim()
			.max(500)
			.transform((v) => stripProtocol(v))
			.refine((v) => v === '' || isValidWebsite(v), 'Enter a valid website (e.g. yourbrand.com)')
	])
	.default('');

const optPhone = z
	.union([z.literal(''), z.string().regex(PHONE_REGEX, 'Enter a valid 10-digit phone number')])
	.default('');

export const createBrandSchema = z.object({
	name: z.string().trim().min(1, 'Brand name is required').max(255),
	contactFirstName: optShortString,
	contactLastName: optShortString,
	contactEmail: optEmail,
	contactPhone: optPhone,
	website: optUrl,
	commissionRate: z
		.number({ message: 'Enter a number between 0 and 100' })
		.min(0, 'Commission rate must be 0 or higher')
		.max(100, 'Commission rate must be 100 or lower')
		.default(0),
	notes: optLongString,
	inviteContact: z.boolean().default(true)
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
