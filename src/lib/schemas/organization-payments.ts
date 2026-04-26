import { z } from 'zod';

const optShortString = z.string().trim().max(255).default('');

export const organizationPaymentsSchema = z
	.object({
		processor: z.enum(['stripe', 'manual']).default('manual'),
		stripeLinkEnabled: z.boolean().default(false),

		// Existing columns:
		acceptedMethods: z.array(z.string().trim().min(1)).default([]),
		defaultMethod: z.string().trim().max(64).default(''),
		defaultTerm: z.string().trim().max(64).default(''),

		requiredDepositEnabled: z.boolean().default(false),
		requiredDepositPercent: z.coerce
			.number({ message: 'Must be a number' })
			.min(0, 'Must be 0 or more')
			.max(100, 'Must be between 0 and 100')
			.default(0),
		depositAccountName: optShortString,

		surchargePassToBuyer: z.boolean().default(false)
	})
	.refine((d) => d.acceptedMethods.length === 0 || d.acceptedMethods.includes(d.defaultMethod), {
		message: 'Pick a default that is in your accepted methods',
		path: ['defaultMethod']
	})
	.refine((d) => !d.requiredDepositEnabled || d.requiredDepositPercent > 0, {
		message: 'Set a percent when deposits are required',
		path: ['requiredDepositPercent']
	});

export type OrganizationPaymentsInput = z.infer<typeof organizationPaymentsSchema>;
