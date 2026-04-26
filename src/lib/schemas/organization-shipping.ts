import { z } from 'zod';

const optShortString = z.string().trim().max(255).default('');
const optStateString = z.string().trim().max(64).default('');
const optZipString = z.string().trim().max(20).default('');

const costType = z.enum(['flat', 'calculated', 'free']);

export const organizationShippingSchema = z
	.object({
		useBusinessAddress: z.boolean().default(true),
		shippingFromLine1: optShortString,
		shippingFromLine2: optShortString,
		shippingFromCity: optShortString,
		shippingFromState: optStateString,
		shippingFromZip: optZipString,
		shippingFromCountry: z.string().trim().max(2, 'Use the ISO 2-letter country code').default(''),
		freeThresholdEnabled: z.boolean().default(false),
		freeThresholdAmount: z.coerce
			.number({ message: 'Must be a number' })
			.min(0, 'Must be 0 or more')
			.max(99_999_999.99)
			.default(0)
	})
	.refine((d) => !d.freeThresholdEnabled || d.freeThresholdAmount > 0, {
		message: 'Set a threshold when free shipping is enabled',
		path: ['freeThresholdAmount']
	});

export type OrganizationShippingInput = z.infer<typeof organizationShippingSchema>;

export const shippingMethodSchema = z
	.object({
		id: z.string().uuid().optional(),
		name: z.string().trim().min(1, 'Name is required').max(100),
		costType: costType.default('flat'),
		costAmount: z.union([z.literal(''), z.coerce.number().min(0).max(99_999_999.99)]).default(''),
		deliveryWindow: z.string().trim().max(100).default('')
	})
	.refine((d) => d.costType !== 'flat' || (typeof d.costAmount === 'number' && d.costAmount >= 0), {
		message: 'Set a cost when cost type is flat',
		path: ['costAmount']
	});

export type ShippingMethodInput = z.infer<typeof shippingMethodSchema>;
