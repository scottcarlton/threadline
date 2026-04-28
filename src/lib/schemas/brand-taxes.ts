import { z } from 'zod';

const optShortString = z.string().trim().max(255).default('');
const pricingDisplay = z.enum(['exclusive', 'inclusive']);
const taxType = z.enum(['origin', 'destination']);
const optRate = z
	.union([
		z.literal(''),
		z.coerce
			.number({ message: 'Must be a number' })
			.min(0, 'Must be between 0 and 100')
			.max(100, 'Must be between 0 and 100')
	])
	.default('');

// Mirror of organizationTaxesSchema — same fields, lands on `brands.*`
// (see migration 20260426000001) for rep-org manual brands.
export const brandTaxesSchema = z.object({
	pricingDisplay: pricingDisplay.default('exclusive'),

	usSalesTaxEnabled: z.boolean().default(false),
	usEin: optShortString,
	usGeneralRate: optRate,

	vatEnabled: z.boolean().default(false),
	vatRegistration: optShortString,
	vatRate: optRate,

	gstEnabled: z.boolean().default(false),
	gstRegistration: optShortString,
	gstRate: optRate
});

export type BrandTaxesInput = z.infer<typeof brandTaxesSchema>;

// Per-state tax rate row in `brand_sales_tax_rates`.
export const brandSalesTaxRateSchema = z.object({
	id: z.string().uuid().optional(),
	stateCode: z.string().trim().toUpperCase().length(2, 'Use the 2-letter state code'),
	rate: z.coerce
		.number({ message: 'Must be a number' })
		.min(0, 'Must be between 0 and 100')
		.max(100, 'Must be between 0 and 100'),
	taxType: taxType.default('destination')
});

export type BrandSalesTaxRateInput = z.infer<typeof brandSalesTaxRateSchema>;
