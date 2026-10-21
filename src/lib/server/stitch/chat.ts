import type Anthropic from '@anthropic-ai/sdk';
import type { StitchCreateClient } from './classify.js';
import { splitSuggestions } from './turn.js';

export const CHAT_MODEL = 'claude-haiku-4-5';

/** The CHAT route: a conversational Haiku reply with no tools. */
export async function runStitchChatReply(p: {
	client: StitchCreateClient;
	system: Anthropic.TextBlockParam[];
	messages: Anthropic.MessageParam[];
	onResponse?: (m: Anthropic.Message) => void;
}): Promise<{
	text: string;
	rawText: string;
	suggestions?: string[];
	malformedSuggestions: boolean;
	response: Anthropic.Message;
}> {
	const response = await p.client.messages.create({
		model: CHAT_MODEL,
		max_tokens: 1024,
		system: p.system,
		messages: p.messages
	});
	p.onResponse?.(response);
	const rawText = response.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map((b) => b.text)
		.join('\n');
	const { text, suggestions, malformedSuggestions } = splitSuggestions(rawText);
	return {
		text,
		rawText,
		suggestions,
		malformedSuggestions: malformedSuggestions === true,
		response
	};
}
