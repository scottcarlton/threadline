import { z } from 'zod';

export const emailIntakeSettingsSchema = z.object({
	email_intake_enabled: z.boolean()
});

export type EmailIntakeSettingsSchema = typeof emailIntakeSettingsSchema;
