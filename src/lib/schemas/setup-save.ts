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

export const setupSaveSchema = z.discriminatedUnion('step', [
	addressPayload,
	shipFromPayload,
	shippingDefaultPayload,
	paymentMethodsPayload,
	paymentTermsPayload
]);

export const setupGatewaySchema = gatewayPayload;

export type SetupSaveInput = z.infer<typeof setupSaveSchema>;
export type SetupGatewayInput = z.infer<typeof setupGatewaySchema>;
