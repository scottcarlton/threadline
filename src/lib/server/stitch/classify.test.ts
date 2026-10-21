import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { classifyStitchMessage } from './classify';
import { CLASSIFIER_PROMPT } from '../ai-prompts';

function client(reply: string) {
	const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
	return {
		calls,
		client: {
			messages: {
				async create(params: Anthropic.MessageCreateParamsNonStreaming) {
					calls.push(params);
					return {
						model: 'claude-haiku-4-5',
						content: [{ type: 'text', text: reply }],
						stop_reason: 'end_turn',
						usage: { input_tokens: 1, output_tokens: 1 }
					} as unknown as Anthropic.Message;
				}
			}
		}
	};
}

describe('classifyStitchMessage', () => {
	it('sends the last two history turns plus the message, exactly as the route did', async () => {
		const c = client('CHAT');
		const history: Anthropic.MessageParam[] = [
			{ role: 'user', content: 'one' },
			{ role: 'assistant', content: 'two' },
			{ role: 'user', content: 'three' },
			{ role: 'assistant', content: 'four' }
		];
		await classifyStitchMessage({ client: c.client, history, message: 'thanks' });
		expect(c.calls[0]).toEqual({
			model: 'claude-haiku-4-5',
			max_tokens: 20,
			system: [{ type: 'text', text: CLASSIFIER_PROMPT }],
			messages: [
				{ role: 'user', content: 'three' },
				{ role: 'assistant', content: 'four' },
				{ role: 'user', content: 'thanks' }
			]
		});
	});
	it('maps CHAT (any case, padded) to CHAT', async () => {
		expect(
			(await classifyStitchMessage({ client: client(' chat\n').client, history: [], message: 'x' }))
				.route
		).toBe('CHAT');
	});
	it('maps anything else to TOOLS', async () => {
		expect(
			(await classifyStitchMessage({ client: client('TOOLS').client, history: [], message: 'x' }))
				.route
		).toBe('TOOLS');
		expect(
			(await classifyStitchMessage({ client: client('maybe').client, history: [], message: 'x' }))
				.route
		).toBe('TOOLS');
	});
	it('says when the label was neither CHAT nor TOOLS', async () => {
		const run = async (label: string) =>
			(await classifyStitchMessage({ client: client(label).client, history: [], message: 'x' }))
				.recognized;
		expect(await run('TOOLS')).toBe(true);
		expect(await run(' chat ')).toBe(true);
		expect(await run('maybe')).toBe(false);
	});
});
