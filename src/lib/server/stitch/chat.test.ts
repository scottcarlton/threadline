import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runStitchChatReply } from './chat';

describe('runStitchChatReply', () => {
	it('calls Haiku with the system blocks and no tools, joins text blocks, splits suggestions', async () => {
		const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
		const client = {
			messages: {
				async create(p: Anthropic.MessageCreateParamsNonStreaming) {
					calls.push(p);
					return {
						model: 'claude-haiku-4-5',
						stop_reason: 'end_turn',
						usage: { input_tokens: 3, output_tokens: 2 },
						content: [
							{ type: 'text', text: 'Anytime.' },
							{ type: 'text', text: 'SUGGESTIONS:["Show drafts","New order"]' }
						]
					} as unknown as Anthropic.Message;
				}
			}
		};
		const system = [{ type: 'text' as const, text: 'sys' }];
		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: 'thanks' }];
		const r = await runStitchChatReply({ client, system, messages });
		expect(calls[0]).toEqual({ model: 'claude-haiku-4-5', max_tokens: 1024, system, messages });
		expect(r.rawText).toBe('Anytime.\nSUGGESTIONS:["Show drafts","New order"]');
		expect(r.text).toBe('Anytime.');
		expect(r.suggestions).toEqual(['Show drafts', 'New order']);
	});
});
