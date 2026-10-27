// src/evals/stitch/adapter.test.ts
import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runCase, gradeCase, perfFrom, loadCases } from './adapter';
import { loadStitchCases } from './schema';
import { JUDGE_MODEL, JUDGE_METRICS } from './judge';

const m = (content: unknown[], stop_reason: string, model = 'claude-sonnet-5-5') =>
	({
		model,
		content,
		stop_reason,
		usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 }
	}) as unknown as Anthropic.Message;

function fake(o: {
	classify: string[];
	chat?: string[];
	turns?: Anthropic.Message[];
	judge?: Anthropic.Message;
}) {
	let ci = 0,
		hi = 0,
		si = 0;
	return {
		messages: {
			stream() {
				const next = o.turns![si++];
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
			},
			async create(p: Anthropic.MessageCreateParamsNonStreaming) {
				if (p.model === JUDGE_MODEL) return o.judge!;
				if (p.max_tokens === 20)
					return m([{ type: 'text', text: o.classify[ci++] }], 'end_turn', 'claude-haiku-4-5');
				return m([{ type: 'text', text: o.chat![hi++] }], 'end_turn', 'claude-haiku-4-5');
			}
		}
	} as unknown as Anthropic;
}
const passAll = m(
	[
		{
			type: 'text',
			text: JSON.stringify(
				Object.fromEntries(JUDGE_METRICS.map((k) => [k, { pass: true, reason: 'ok' }]))
			)
		}
	],
	'end_turn',
	JUDGE_MODEL
);

describe('adapter', () => {
	it('runs a two-turn TOOLS conversation, then checks and judge', async () => {
		const c = loadStitchCases(['order-bloom-multi-brand-rep'])[0];
		const client = fake({
			classify: ['TOOLS', 'TOOLS'],
			turns: [
				m([{ type: 'tool_use', id: 't1', name: 'list_brands', input: {} }], 'tool_use'),
				m(
					[
						{
							type: 'text',
							text: 'Which brand is this for: Saltwater Linen, Juniper & Co, or Harbor Denim?\nSUGGESTIONS:["Saltwater Linen","Harbor Denim"]'
						}
					],
					'end_turn'
				),
				m(
					[
						{
							type: 'tool_use',
							id: 't2',
							name: 'create_order',
							input: { account_name: 'Bloom Boutique', brand_name: 'Saltwater Linen' }
						}
					],
					'tool_use'
				),
				m(
					[
						{
							type: 'text',
							text: 'Done, submitted SAL-000041.\nSUGGESTIONS:["View order","New order"]'
						}
					],
					'end_turn'
				)
			],
			judge: passAll
		});
		const run = await runCase(c, {}, { client });
		expect(run.routes).toEqual(['TOOLS', 'TOOLS']);
		expect(run.turns).toBe(2);
		expect(run.tool_calls).toBe(2);
		expect(run.unscripted_calls).toBe(0);
		expect(run.model).toBe('claude-sonnet-5-5');
		expect(run.usage).toEqual({
			input_tokens: 40,
			output_tokens: 20,
			cache_read_input_tokens: 8,
			cache_creation_input_tokens: 0
		});
		expect(run.haiku_usage?.input_tokens).toBe(20);
		expect(run.transcript.filter((t) => t.role === 'user').map((t) => t.content)).toContain(
			'Saltwater Linen'
		);
		const g = await gradeCase(c, run, null, {}, { client });
		expect(g.grade).toMatchObject({
			route: 1,
			brand_ask: 1,
			confirm_gate: 1,
			no_unscripted_write: 1,
			lookup_first: 1,
			format: 1,
			faithful: 1,
			right_action: 1
		});
		expect(g.grade).not.toHaveProperty('guest_readonly');
		expect(g.judge_model).toBe(JUDGE_MODEL);
		expect(perfFrom(run)).toMatchObject({ tool_calls: 2, unscripted_calls: 0, turns: 2 });
	});

	it('scores route 0 when a follow-up is misrouted to CHAT', async () => {
		const c = loadStitchCases(['order-bloom-multi-brand-rep'])[0];
		const client = fake({
			classify: ['TOOLS', 'CHAT'],
			chat: ['Saltwater Linen it is.\nSUGGESTIONS:["a","b"]'],
			turns: [m([{ type: 'text', text: 'Which brand?\nSUGGESTIONS:["a","b"]' }], 'end_turn')],
			judge: passAll
		});
		const run = await runCase(c, {}, { client });
		const g = await gradeCase(c, run, null, {}, { client });
		expect(g.grade.route).toBe(0);
		expect(g.explanation.route).toMatch(/turn 2/);
	});

	it('tells the judge which tool calls were unscripted', async () => {
		const c = loadStitchCases(['thanks-routes-chat'])[0];
		const client = fake({
			classify: ['CHAT'],
			chat: ['Anytime.\nSUGGESTIONS:["a","b"]'],
			judge: passAll
		});
		const run = await runCase(c, {}, { client });
		run.observation.unscripted = ['search_products'];
		const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
		const create = client.messages.create.bind(client.messages);
		(client.messages as unknown as { create: unknown }).create = (
			p: Anthropic.MessageCreateParamsNonStreaming
		) => {
			sent.push(p);
			return create(p);
		};
		await gradeCase(c, run, null, {}, { client });
		const judgeReq = sent.find((p) => p.model === JUDGE_MODEL)!;
		expect(String(judgeReq.messages[0].content)).toMatch(
			/<unscripted_tool_calls>[^<]*search_products/
		);
	});

	it('a CHAT-only conversation reports Haiku as the row model', async () => {
		const c = loadStitchCases(['thanks-routes-chat'])[0];
		const run = await runCase(
			c,
			{},
			{ client: fake({ classify: ['CHAT'], chat: ['Anytime.\nSUGGESTIONS:["a","b"]'] }) }
		);
		expect(run.model).toBe('claude-haiku-4-5');
		expect(run.haiku_usage).toBeUndefined();
	});

	it('marks a conversation truncated when any turn hits max_tokens', async () => {
		const c = loadStitchCases(['thanks-routes-chat'])[0];
		const run = await runCase(
			c,
			{},
			{
				client: fake({
					classify: ['TOOLS'],
					turns: [m([{ type: 'text', text: 'Any' }], 'max_tokens')]
				})
			}
		);
		expect(run.status).toBe('truncated');
	});

	it('rejects a turn served by an unexpected model', async () => {
		const c = loadStitchCases(['thanks-routes-chat'])[0];
		const client = fake({
			classify: ['TOOLS'],
			turns: [m([{ type: 'text', text: 'x' }], 'end_turn', 'claude-opus-4-6')]
		});
		await expect(runCase(c, {}, { client })).rejects.toThrow(/served by/);
	});

	it('loadCases honours STITCH_EVAL_CASES and joins turns into prompt', async () => {
		process.env.STITCH_EVAL_CASES = 'order-bloom-multi-brand-rep';
		try {
			const [only] = await loadCases();
			expect(only.id).toBe('order-bloom-multi-brand-rep');
			expect(only.prompt).toContain('\n---\nSaltwater Linen');
		} finally {
			delete process.env.STITCH_EVAL_CASES;
		}
	});
});
