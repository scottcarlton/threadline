import { z } from 'zod';

const addressPayload = z.object({
	step: z.literal('address'),
	value: z.object({
		line1: z.string().trim().min(1, 'Address is required').max(255),
		line2: z.string().trim().max(255).default(''),
		city: z.string().trim().min(1, 'City is required').max(255),
		state: z.string().trim().min(1, 'State is required').max(64),
		zip: z.string().trim().min(1, 'ZIP is required').max(20),
		country: z.string().trim().length(2).default('US')
	})
});

const shipFromPayload = z.object({
	step: z.literal('ship-from'),
	value: z.enum(['yes', 'skip'])
});

const shippingDefaultPayload = z.object({
	step: z.literal('shipping-default'),
	value: z.union([z.literal('skip'), z.string().uuid('Must be a valid shipping method ID')])
});

const paymentMethodsPayload = z.object({
	step: z.literal('payment-methods'),
	value: z.union([
		z.literal('skip'),
		z.array(z.enum(['credit_card', 'ach', 'check', 'wire', 'other'])).min(1, 'Select at least one')
	])
});

const paymentTermsPayload = z.object({
	step: z.literal('payment-terms'),
	value: z.union([
		z.literal('skip'),
		z.enum(['net_15', 'net_30', 'net_60', 'net_90', 'cod', 'prepaid'])
	])
});

const gatewayPayload = z.object({
	step: z.enum(['orders', 'taxes', 'returns']),
	value: z.enum(['yes', 'skip'])
});

const accountManualPayload = z.object({
	step: z.literal('account-manual'),
	value: z.object({
		businessName: z.string().trim().min(1, 'Business name is required').max(255),
		contactName: z.string().trim().max(255).default(''),
		contactEmail: z.union([z.literal(''), z.string().trim().email()]).default(''),
		contactPhone: z.string().trim().max(20).default(''),
		addressLine1: z.string().trim().max(255).default(''),
		addressLine2: z.string().trim().max(255).default(''),
		city: z.string().trim().max(255).default(''),
		state: z.string().trim().max(64).default(''),
		zip: z.string().trim().max(20).default('')
	})
});

const brandManualPayload = z.object({
	step: z.literal('brand-manual'),
	value: z.object({
		name: z.string().trim().min(1, 'Brand name is required').max(255),
		// contactName is the legacy single-field shape SetupQuestionCard still
		// sends; the preflight form sends the split names the brands table
		// actually stores. The endpoint takes the split pair when present and
		// falls back to splitting contactName.
		contactName: z.string().trim().max(255).default(''),
		contactFirstName: z.string().trim().max(255).default(''),
		contactLastName: z.string().trim().max(255).default(''),
		contactEmail: z.union([z.literal(''), z.string().trim().email()]).default(''),
		contactPhone: z.string().trim().max(50).default(''),
		website: z.string().trim().max(500).default(''),
		commissionRate: z.coerce.number().min(0).max(100).default(0),
		notes: z.string().trim().max(2000).default('')
	})
});

const productManualPayload = z.object({
	step: z.literal('product-manual'),
	value: z.object({
		brandId: z.string().uuid().optional(),
		styleNumber: z.string().trim().min(1, 'Style number is required').max(100),
		name: z.string().trim().min(1, 'Name is required').max(255),
		wholesalePrice: z.coerce.number().min(0, 'Price must be 0 or more').max(99_999_999.99),
		retailPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
		category: z.string().trim().max(100).default(''),
		sizes: z.array(z.string().trim().min(1)).default([]),
		colors: z.array(z.string().trim().min(1)).default([])
	})
});

const memberInvitePayload = z.object({
	step: z.literal('member-invite'),
	value: z.object({
		email: z.string().trim().email('Valid email required'),
		role: z.enum(['admin', 'member', 'sales', 'guest']),
		commissionRate: z.coerce.number().min(0).max(100).default(0)
	})
});

const partnerInvitePayload = z.object({
	step: z.literal('partner-invite'),
	value: z.object({
		email: z.string().trim().email('Valid email required')
	})
});

export const setupSaveSchema = z.discriminatedUnion('step', [
	addressPayload,
	shipFromPayload,
	shippingDefaultPayload,
	paymentMethodsPayload,
	paymentTermsPayload,
	brandManualPayload,
	productManualPayload,
	accountManualPayload,
	memberInvitePayload,
	partnerInvitePayload
]);

export const setupGatewaySchema = gatewayPayload;

export type SetupSaveInput = z.infer<typeof setupSaveSchema>;
export type SetupGatewayInput = z.infer<typeof setupGatewaySchema>;
