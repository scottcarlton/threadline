import { z } from 'zod';

export const brandTermsSchema = z.object({
	brand_id: z.string().uuid(),
	title: z
		.string()
		.trim()
		.min(1, 'Give the terms a title')
		.max(120, 'Title must be 120 characters or fewer'),
	body: z
		.string()
		.trim()
		.min(1, 'Write the terms')
		.max(20000, 'Terms must be 20,000 characters or fewer')
});

export type BrandTermsInput = z.infer<typeof brandTermsSchema>;
