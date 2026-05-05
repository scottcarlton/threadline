import { z } from 'zod';

const variantSchema = z.object({
	id: z.string(),
	colorName: z.string().trim().min(1, 'Color name is required').max(100),
	colorHex: z.string().trim().max(7).default(''),
	isPrimary: z.boolean().default(false),
	inventory: z.record(z.string(), z.number().int().min(0).nullable()).default({}),
	stockThreshold: z.number().int().min(0).nullable().default(null)
});

export const createProductSchema = z
	.object({
		name: z.string().trim().min(1, 'Product name is required').max(255),
		styleNumber: z.string().trim().min(1, 'Style number is required').max(100),
		seasonId: z.string().trim().default(''),
		productYear: z.coerce
			.number()
			.int()
			.min(2000)
			.max(2100)
			.nullable()
			.default(new Date().getFullYear()),
		category: z.string().trim().max(255).default(''),
		wholesalePrice: z.coerce.number().min(0, 'Wholesale price is required'),
		retailPrice: z.coerce.number().min(0).nullable().default(null),
		ats: z.boolean().default(false),
		featured: z.boolean().default(false),

		sizeMode: z.enum(['letter', 'numeric']).default('letter'),
		sizes: z.array(z.string().trim().min(1)).min(1, 'Select at least one size'),

		hasVariants: z.boolean().default(false),

		productInventory: z.record(z.string(), z.number().int().min(0).nullable()).default({}),
		stockThreshold: z.number().int().min(0).nullable().default(null),

		variants: z.array(variantSchema).default([]),

		description: z.string().trim().max(5000).default('')
	})
	.refine(
		(data) => {
			if (data.hasVariants && data.variants.length === 0) return false;
			return true;
		},
		{ message: 'Add at least one color variant', path: ['variants'] }
	)
	.refine(
		(data) => {
			if (data.hasVariants && data.variants.length > 0) {
				return data.variants.some((v) => v.isPrimary);
			}
			return true;
		},
		{ message: 'Select a primary color', path: ['variants'] }
	);

export type CreateProductInput = z.infer<typeof createProductSchema>;
