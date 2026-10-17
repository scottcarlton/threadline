import type Anthropic from '@anthropic-ai/sdk';
import { CLASSIFIER_PROMPT } from '../ai-prompts.js';

export type StitchRoute = 'CHAT' | 'TOOLS';
export const CLASSIFIER_MODEL = 'claude-haiku-4-5';

/** The slice of the Anthropic client a non-streamed call uses, so tests can fake it. */
export type StitchCreateClient = {
	messages: {
		create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
	};
};

/**
 * Pre-flight routing: CHAT goes to Haiku with no tools, TOOLS to the Sonnet
 * tool loop. The last two history turns are included so follow-ups like "what
 * about the other ones?" classify against prior context.
 */
export async function classifyStitchMessage(p: {
	client: StitchCreateClient;
	history: Anthropic.MessageParam[];
	message: string;
	onResponse?: (m: Anthropic.Message) => void;
}): Promise<{ route: StitchRoute; response: Anthropic.Message }> {
	const response = await p.client.messages.create({
		model: CLASSIFIER_MODEL,
		max_tokens: 20,
		system: [{ type: 'text', text: CLASSIFIER_PROMPT }],
		messages: [...p.history.slice(-2), { role: 'user', content: p.message }]
	});
	p.onResponse?.(response);
	const label =
		response.content[0]?.type === 'text' ? response.content[0].text.trim().toUpperCase() : 'TOOLS';
	return { route: label === 'CHAT' ? 'CHAT' : 'TOOLS', response };
}
