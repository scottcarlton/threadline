/**
 * One-shot title generation for a new conversation.
 *
 * Fire and forget, the same shape as logUsage: a title is cosmetic and must
 * never delay or fail the answer the user is waiting on. Runs on Haiku,
 * matching the classifier call in /api/ai.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { fallbackTitle, normalizeTitle, setTitle } from './ai-conversations.js';
import { logUsage } from './ai-usage.js';

const TITLE_MODEL = 'claude-haiku-4-5';

const TITLE_PROMPT = `Write a short title for this conversation.

Rules:
- 3 to 6 words
- A noun phrase describing the topic, not a sentence
- No quotes, no trailing punctuation
- Name the concrete subject where there is one (a brand, an account, a season)

Respond with the title only.`;

export function generateTitle(params: {
	anthropic: Anthropic;
	conversationId: string;
	firstUserMessage: string;
	firstAssistantMessage: string;
	organizationId: string;
	userId: string;
}): void {
	const fallback = fallbackTitle(params.firstUserMessage);

	void (async () => {
		try {
			const response = await params.anthropic.messages.create({
				model: TITLE_MODEL,
				max_tokens: 20,
				system: [{ type: 'text', text: TITLE_PROMPT }],
				messages: [
					{
						role: 'user',
						content: `User: ${params.firstUserMessage}\n\nAssistant: ${params.firstAssistantMessage}`
					}
				]
			});
			logUsage({
				endpoint: 'chat',
				purpose: 'title',
				model: TITLE_MODEL,
				organizationId: params.organizationId,
				userId: params.userId,
				response
			});
			const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
			const title = normalizeTitle(raw) ?? fallback;
			if (title) await setTitle(params.conversationId, title);
		} catch (err) {
			console.error('conversation title generation failed:', err);
			if (fallback) await setTitle(params.conversationId, fallback);
		}
	})();
}
