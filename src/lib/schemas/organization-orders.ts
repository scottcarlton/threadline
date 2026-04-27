import { z } from 'zod';

export const organizationOrdersSchema = z
	.object({
		// Order number format
		orderNumberPrefix: z.string().trim().max(10, 'Max 10 characters').default(''),
		nextOrderNumber: z.coerce
			.number({ message: 'Must be a number' })
			.int('Whole number only')
			.min(1, 'Must be at least 1')
			.max(2_147_483_647)
			.default(1),
		orderNumberPadWidth: z.coerce
			.number({ message: 'Must be a number' })
			.int('Whole number only')
			.min(0, '0 disables padding')
			.max(12, 'Cap at 12 digits')
			.default(0),

		// Order minimum
		orderMinimumEnabled: z.boolean().default(false),
		orderMinimumAmount: z.coerce
			.number({ message: 'Must be a number' })
			.min(0, 'Must be 0 or more')
			.max(99_999_999.99)
			.default(0),

		// Default commission rate (UI moved here from Profile in Phase 3;
		// the column stays `organizations.default_commission_rate`).
		defaultCommissionRate: z.coerce
			.number({ message: 'Must be a number' })
			.min(0, 'Must be between 0 and 100')
			.max(100, 'Must be between 0 and 100')
			.default(10),

		// Handling fee
		handlingFeeAmount: z.coerce
			.number({ message: 'Must be a number' })
			.min(0, 'Must be 0 or more')
			.max(99_999_999.99)
			.default(0)
	})
	.refine((d) => !d.orderMinimumEnabled || d.orderMinimumAmount > 0, {
		message: 'Enter a minimum amount when order minimums are enabled',
		path: ['orderMinimumAmount']
	});

export type OrganizationOrdersInput = z.infer<typeof organizationOrdersSchema>;
