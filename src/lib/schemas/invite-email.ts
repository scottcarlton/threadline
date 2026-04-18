import { z } from 'zod';

export const inviteEmailSchema = z.object({
	recipient_email: z
		.string()
		.trim()
		.min(1, 'Enter an email address')
		.email('Enter a valid email address')
		.max(255),
	message: z
		.string()
		.trim()
		.max(500, 'Keep your note under 500 characters')
		.optional()
		.transform((v) => (v && v.length ? v : undefined))
});

export type InviteEmailInput = z.infer<typeof inviteEmailSchema>;
