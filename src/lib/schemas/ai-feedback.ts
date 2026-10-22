import { z } from 'zod';

// Body of POST /api/ai/feedback. The ids are the ones the chat route returned
// with the answer; the endpoint checks each against the database before
// storing it, so a row only links to a turn the rater actually had.

/** Longest prompt or answer copied onto a feedback row. */
export const FEEDBACK_CONTENT_MAX = 10_000;
/** Longest free-text comment kept. */
export const FEEDBACK_TEXT_MAX = 2_000;

const clipped = (max: number) => z.string().transform((s) => s.slice(0, max));

export const aiFeedbackSchema = z
	.object({
		rating: z.union([z.literal(1), z.literal(-1)]),
		messageContent: clipped(FEEDBACK_CONTENT_MAX),
		responseContent: clipped(FEEDBACK_CONTENT_MAX),
		feedbackText: clipped(FEEDBACK_TEXT_MAX).optional(),
		conversationId: z.uuid().optional(),
		messageId: z.uuid().optional(),
		turnId: z.uuid().optional()
	})
	.refine((b) => !b.messageId || b.conversationId, {
		message: 'messageId needs the conversationId it belongs to',
		path: ['conversationId']
	});

export type AiFeedbackInput = z.output<typeof aiFeedbackSchema>;
