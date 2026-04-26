import { z } from 'zod';
import { PHONE_REGEX } from '$lib/utils/phone';
import { isValidWebsite, stripProtocol } from '$lib/utils/website';

const optShortString = z.string().trim().max(255).default('');
const optStateString = z.string().trim().max(64).default('');
const optZipString = z.string().trim().max(20).default('');

const optPhone = z
	.union([z.literal(''), z.string().regex(PHONE_REGEX, 'Enter a valid 10-digit phone number')])
	.default('');

const optEmail = z
	.union([z.literal(''), z.string().trim().email('Enter a valid email address').max(255)])
	.default('');

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

export const organizationProfileSchema = z.object({
	// Identity (logo is managed atomically via /api/organization/logo and is
	// not part of this form payload — the upload + DB update happen together)
	name: z.string().trim().min(1, 'Organization name is required').max(255),
	legalBusinessName: optShortString,
	tagline: z.string().trim().max(80, 'Max 80 characters').default(''),

	// Contact — written to the org's self-brand row when the org is a brand org.
	// The server ignores these for rep orgs.
	website: optUrl,
	contactEmail: optEmail,
	contactPhone: optPhone,

	// Business address (org-level)
	addressLine1: optShortString,
	addressLine2: optShortString,
	city: optShortString,
	state: optStateString,
	zip: optZipString,
	country: z.string().trim().length(2, 'Use the ISO 2-letter country code').default('US'),

	// Regional defaults
	timeZone: z.string().trim().min(1, 'Time zone is required').default('America/Los_Angeles'),
	currencyCode: z.string().trim().length(3, 'Use the ISO 3-letter currency code').default('USD')
});

export type OrganizationProfileInput = z.infer<typeof organizationProfileSchema>;
