import { describe, it, expect } from 'vitest';
import { aiFeedbackSchema, FEEDBACK_CONTENT_MAX, FEEDBACK_TEXT_MAX } from './ai-feedback';

const ID = '44444444-4444-4444-8444-444444444444';
const base = { rating: 1, messageContent: 'q', responseContent: 'a' };

describe('aiFeedbackSchema', () => {
	it('accepts a rating with no ids, for an answer that was never saved', () => {
		expect(aiFeedbackSchema.parse(base)).toEqual(base);
	});

	it('accepts the conversation, message, and turn ids', () => {
		const body = { ...base, rating: -1, conversationId: ID, messageId: ID, turnId: ID };
		expect(aiFeedbackSchema.parse(body)).toEqual(body);
	});

	it('rejects a rating other than 1 or -1', () => {
		expect(aiFeedbackSchema.safeParse({ ...base, rating: 0 }).success).toBe(false);
		expect(aiFeedbackSchema.safeParse({ ...base, rating: '1' }).success).toBe(false);
	});

	it('requires both text copies', () => {
		expect(aiFeedbackSchema.safeParse({ rating: 1, messageContent: 'q' }).success).toBe(false);
	});

	it('rejects ids that are not uuids', () => {
		expect(aiFeedbackSchema.safeParse({ ...base, turnId: 'turn-1' }).success).toBe(false);
	});

	it('rejects a message id without its conversation', () => {
		const r = aiFeedbackSchema.safeParse({ ...base, messageId: ID });
		expect(r.success).toBe(false);
		if (r.success) return;
		expect(r.error.issues[0].path).toEqual(['conversationId']);
	});

	it('clips long text instead of rejecting the rating', () => {
		const r = aiFeedbackSchema.parse({
			...base,
			responseContent: 'x'.repeat(FEEDBACK_CONTENT_MAX + 5),
			feedbackText: 'y'.repeat(FEEDBACK_TEXT_MAX + 5)
		});
		expect(r.responseContent).toHaveLength(FEEDBACK_CONTENT_MAX);
		expect(r.feedbackText).toHaveLength(FEEDBACK_TEXT_MAX);
	});
});
