import { z } from 'zod';

// The preflight resume cursor, as stored in organizations.onboarding_state.
// Validated on the way in: the endpoint writes client-supplied JSON straight to
// the column, so without a schema any shape or size could be persisted.

export const MAX_STATS = 12;
export const MAX_SUB_STATES = 64;

export const onboardingStateSchema = z.object({
	phase: z.number().int().min(0).max(20),
	sub: z.number().int().min(0).max(50),
	subStates: z
		.record(z.string().max(16), z.enum(['done', 'skipped']))
		.refine((r) => Object.keys(r).length <= MAX_SUB_STATES, {
			message: `At most ${MAX_SUB_STATES} sub-steps`
		})
		.optional(),
	stats: z
		.array(
			z.object({
				key: z.string().max(32).optional(),
				n: z.string().max(12),
				label: z.string().max(64),
				note: z.string().max(64).optional()
			})
		)
		.max(MAX_STATS)
		.optional()
});

export type OnboardingState = z.infer<typeof onboardingStateSchema>;
