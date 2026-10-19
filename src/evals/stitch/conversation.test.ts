// src/evals/stitch/conversation.test.ts
import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runConversation } from './conversation';

type Scripted = { classify: string[]; chat: string[]; turns: Anthropic.Message[] };
const m = (content: unknown[], stop_reason: string, model = 'claude-sonnet-4-6') =>
	({
		model,
		content,
		stop_reason,
		usage: { input_tokens: 1, output_tokens: 1 }
	}) as unknown as Anthropic.Message;

function fake(s: Scripted) {
	const seen = {
		classify: [] as Anthropic.MessageParam[][],
		chat: [] as Anthropic.MessageParam[][],
		stream: [] as Anthropic.MessageParam[][]
	};
	let ci = 0,
		hi = 0,
		si = 0;
	const client = {
		messages: {
			async create(p: Anthropic.MessageCreateParamsNonStreaming) {
				if (p.max_tokens === 20) {
					seen.classify.push(structuredClone(p.messages));
					return m([{ type: 'text', text: s.classify[ci++] }], 'end_turn', 'claude-haiku-4-5');
				}
				seen.chat.push(structuredClone(p.messages));
				return m([{ type: 'text', text: s.chat[hi++] }], 'end_turn', 'claude-haiku-4-5');
			},
			stream(p: Anthropic.MessageStreamParams) {
				seen.stream.push(structuredClone(p.messages));
				const next = s.turns[si++];
				let cb: ((d: string) => void) | null = null;
				return {
					on(_e: 'text', f: (d: string) => void) {
						cb = f;
						return this;
					},
					async finalMessage() {
						for (const b of next.content) if (b.type === 'text') cb?.(b.text);
						return next;
					}
				};
			}
		}
	};
	return { client, seen };
}

const base = {
	system: [{ type: 'text' as const, text: 'sys' }],
	tools: [],
	role: 'owner',
	brandScope: null,
	executeTool: async () => ({ success: true, data: [{ id: 'b-1', name: 'Saltwater Linen' }] })
};

describe('runConversation', () => {
	it('follows the classifier per turn and rebuilds text-only history between turns', async () => {
		const { client, seen } = fake({
			classify: ['TOOLS', 'TOOLS'],
			chat: [],
			turns: [
				m([{ type: 'tool_use', id: 't1', name: 'list_brands', input: {} }], 'tool_use'),
				m([{ type: 'text', text: 'Which brand?\nSUGGESTIONS:["a","b"]' }], 'end_turn'),
				m([{ type: 'text', text: 'Submitted SAL-1.\nSUGGESTIONS:["a","b"]' }], 'end_turn')
			]
		});
		const out = await runConversation({
			...base,
			client,
			history: [],
			turns: ['order for Bloom', 'Saltwater Linen']
		});
		expect(out.map((t) => t.route)).toEqual(['TOOLS', 'TOOLS']);
		expect(out[0].attempted.map((a) => a.name)).toEqual(['list_brands']);
		// Turn 2 sees only plain text from turn 1: no tool_use or tool_result blocks.
		expect(seen.stream[2]).toEqual([
			{ role: 'user', content: 'order for Bloom' },
			{ role: 'assistant', content: 'Which brand?' },
			{ role: 'user', content: 'Saltwater Linen' }
		]);
		expect(out[1].text).toBe('Submitted SAL-1.');
	});

	it('sends a CHAT turn to the Haiku reply with no tools', async () => {
		const { client, seen } = fake({
			classify: ['CHAT'],
			chat: ['Anytime.\nSUGGESTIONS:["a","b"]'],
			turns: []
		});
		const out = await runConversation({
			...base,
			client,
			history: [
				{ role: 'user', content: 'q' },
				{ role: 'assistant', content: 'a' }
			],
			turns: ['thanks']
		});
		expect(out[0].route).toBe('CHAT');
		expect(out[0].attempted).toEqual([]);
		expect(seen.stream).toHaveLength(0);
		expect(seen.chat[0]).toEqual([
			{ role: 'user', content: 'q' },
			{ role: 'assistant', content: 'a' },
			{ role: 'user', content: 'thanks' }
		]);
		expect(out[0].transcript.at(-1)).toEqual({
			role: 'assistant',
			content: 'Anytime.\nSUGGESTIONS:["a","b"]'
		});
	});

	it('a misrouted follow-up runs without tools, so the order is never created', async () => {
		const { client } = fake({
			classify: ['TOOLS', 'CHAT'],
			chat: ['Got it, Saltwater Linen.\nSUGGESTIONS:["a","b"]'],
			turns: [m([{ type: 'text', text: 'Which brand?\nSUGGESTIONS:["a","b"]' }], 'end_turn')]
		});
		const out = await runConversation({
			...base,
			client,
			history: [],
			turns: ['order', 'Saltwater Linen']
		});
		expect(out[1].route).toBe('CHAT');
		expect(out.flatMap((t) => t.attempted)).toEqual([]);
	});

	it('applies the 20-turn history limit before each turn', async () => {
		const history = Array.from({ length: 24 }, (_, i) => ({
			role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
			content: `h${i}`
		}));
		const { client, seen } = fake({
			classify: ['TOOLS'],
			chat: [],
			turns: [m([{ type: 'text', text: 'Who is "her"?' }], 'end_turn')]
		});
		await runConversation({ ...base, client, history, turns: ['same as her last order'] });
		expect(seen.stream[0]).toHaveLength(21);
		expect(seen.stream[0][0]).toEqual({ role: 'user', content: 'h4' });
	});
});
