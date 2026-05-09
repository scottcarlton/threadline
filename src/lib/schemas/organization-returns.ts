import { z } from 'zod';

const optShortString = z.string().trim().max(255).default('');
const optStateString = z.string().trim().max(64).default('');
const optZipString = z.string().trim().max(20).default('');

const restockingFeeType = z.enum(['percent', 'flat']);

export const organizationReturnsSchema = z
	.object({
		// 0 disables returns. Otherwise the buyer must initiate a return
		// within this many days of order delivery.
		windowDays: z.coerce
			.number({ message: 'Must be a number' })
			.int('Whole number only')
			.min(0, 'Must be 0 or more')
			.max(3650, 'Cap at 10 years')
			.default(0),

		policyText: z.string().trim().max(20_000).default(''),

		useShipFromAddress: z.boolean().default(true),
		returnsAddressLine1: optShortString,
		returnsAddressLine2: optShortString,
		returnsAddressCity: optShortString,
		returnsAddressState: optStateString,
		returnsAddressZip: optZipString,
		returnsAddressCountry: z
			.string()
			.trim()
			.max(2, 'Use the ISO 2-letter country code')
			.default(''),

		restockingFeeType: restockingFeeType.default('percent'),
		restockingFeeValue: z.coerce
			.number({ message: 'Must be a number' })
			.min(0, 'Must be 0 or more')
			.max(99_999_999.99)
			.default(0),

		buyerPaysShipping: z.boolean().default(false)
	})
	.refine((d) => d.restockingFeeType !== 'percent' || d.restockingFeeValue <= 100, {
		message: 'Percent fee must be 0–100',
		path: ['restockingFeeValue']
	});

export type OrganizationReturnsInput = z.infer<typeof organizationReturnsSchema>;
