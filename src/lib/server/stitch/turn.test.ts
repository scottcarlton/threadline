// src/lib/server/stitch/turn.test.ts
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runStitchTurn, splitSuggestions, type StitchEvent, type StitchModelClient } from './turn';

function msg(
	content: Anthropic.ContentBlock[],
	stop_reason: Anthropic.Message['stop_reason']
): Anthropic.Message {
	return {
		id: 'msg_test',
		type: 'message',
		role: 'assistant',
		model: 'claude-sonnet-4-6',
		content,
		stop_reason,
		stop_sequence: null,
		usage: { input_tokens: 10, output_tokens: 5 }
	} as Anthropic.Message;
}
const text = (t: string) => ({ type: 'text', text: t, citations: null }) as Anthropic.TextBlock;
const toolUse = (id: string, name: string, input: Record<string, unknown>) =>
	({ type: 'tool_use', id, name, input }) as Anthropic.ToolUseBlock;

function fakeClient(script: Anthropic.Message[]) {
	const calls: Anthropic.MessageStreamParams[] = [];
	const client: StitchModelClient = {
		messages: {
			stream(params) {
				calls.push(structuredClone(params));
				const next = script[Math.min(calls.length - 1, script.length - 1)];
				let onText: ((d: string) => void) | null = null;
				return {
					on(_e, cb) {
						onText = cb;
						return this;
					},
					async finalMessage() {
						for (const b of next.content) if (b.type === 'text') onText?.(b.text);
						return next;
					}
				};
			}
		}
	};
	return { client, calls };
}

const baseParams = {
	system: [{ type: 'text' as const, text: 'sys' }],
	tools: [],
	role: 'owner',
	brandScope: null
};

describe('splitSuggestions', () => {
	it('strips a valid SUGGESTIONS line', () => {
		expect(splitSuggestions('Done.\nSUGGESTIONS:["a","b"]')).toEqual({
			text: 'Done.',
			suggestions: ['a', 'b']
		});
	});
	it('leaves text untouched when the line does not parse', () => {
		expect(splitSuggestions('Done.\nSUGGESTIONS:[oops')).toEqual({
			text: 'Done.\nSUGGESTIONS:[oops'
		});
	});
	it('leaves text untouched when there is no line', () => {
		expect(splitSuggestions('Done.\n')).toEqual({ text: 'Done.\n' });
	});
});

describe('runStitchTurn', () => {
	it('streams a plain reply and parses suggestions', async () => {
		const { client } = fakeClient([msg([text('Hi.\nSUGGESTIONS:["x","y"]')], 'end_turn')]);
		const events: StitchEvent[] = [];
		const executeTool = vi.fn();
		const r = await runStitchTurn({
			...baseParams,
			client,
			messages: [{ role: 'user', content: 'hello' }],
			executeTool,
			onEvent: (e) => events.push(e)
		});
		expect(events).toEqual([{ type: 'text', delta: 'Hi.\nSUGGESTIONS:["x","y"]' }]);
		expect(r.text).toBe('Hi.');
		expect(r.suggestions).toEqual(['x', 'y']);
		expect(r.responses).toHaveLength(1);
		expect(r.stopReason).toBe('end_turn');
		expect(executeTool).not.toHaveBeenCalled();
	});

	it('runs a tool, feeds the result back, and emits progress events in order', async () => {
		const { client, calls } = fakeClient([
			msg([text('Looking. '), toolUse('t1', 'query_data', { entity: 'accounts' })], 'tool_use'),
			msg([text('Found 2.')], 'end_turn')
		]);
		const events: StitchEvent[] = [];
		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: 'accounts?' }];
		const executeTool = vi.fn(async () => ({ success: true, data: [{ id: 'a1' }, { id: 'a2' }] }));
		const r = await runStitchTurn({
			...baseParams,
			client,
			messages,
			executeTool,
			onEvent: (e) => events.push(e)
		});
		expect(executeTool).toHaveBeenCalledWith('query_data', { entity: 'accounts' });
		expect(events).toEqual([
			{ type: 'text', delta: 'Looking. ' },
			{ type: 'tool_start', name: 'query_data' },
			{ type: 'tool_result', name: 'query_data', ok: true },
			{ type: 'text', delta: 'Found 2.' }
		]);
		expect(r.rawText).toBe('Looking. Found 2.');
		expect(r.actions).toEqual([
			{
				tool: 'query_data',
				input: { entity: 'accounts' },
				result: { success: true, data: [{ id: 'a1' }, { id: 'a2' }] }
			}
		]);
		expect(calls).toHaveLength(2);
		expect(JSON.stringify(calls[1].messages.at(-1)!.content)).toContain('"tool_use_id":"t1"');
		expect(messages.at(-1)).toMatchObject({ role: 'assistant' });
	});

	it('denies write tools for guests without executing them', async () => {
		const { client, calls } = fakeClient([
			msg([toolUse('t1', 'create_order', { account_name: 'X' })], 'tool_use'),
			msg([text('I cannot do that.')], 'end_turn')
		]);
		const events: StitchEvent[] = [];
		const executeTool = vi.fn();
		const r = await runStitchTurn({
			...baseParams,
			role: 'guest',
			client,
			messages: [{ role: 'user', content: 'order' }],
			executeTool,
			onEvent: (e) => events.push(e)
		});
		expect(executeTool).not.toHaveBeenCalled();
		expect(events).toContainEqual({ type: 'tool_result', name: 'create_order', ok: false });
		expect(r.attempted).toEqual([
			{ name: 'create_order', input: { account_name: 'X' }, denied: true }
		]);
		expect(r.actions).toEqual([]);
		expect(JSON.stringify(calls[1].messages.at(-1)!.content)).toContain('Permission denied');
	});

	it('denies update_brand outside the brand scope', async () => {
		const { client } = fakeClient([
			msg([toolUse('t1', 'update_brand', { brand_id: 'b-other' })], 'tool_use'),
			msg([text('No access.')], 'end_turn')
		]);
		const executeTool = vi.fn();
		const r = await runStitchTurn({
			...baseParams,
			brandScope: ['b-mine'],
			client,
			messages: [{ role: 'user', content: 'rename' }],
			executeTool
		});
		expect(executeTool).not.toHaveBeenCalled();
		expect(r.attempted[0]).toMatchObject({ name: 'update_brand', denied: true });
	});

	it('stops after 10 model calls even if the model keeps calling tools', async () => {
		const { client, calls } = fakeClient([msg([toolUse('t', 'list_brands', {})], 'tool_use')]);
		const r = await runStitchTurn({
			...baseParams,
			client,
			messages: [{ role: 'user', content: 'loop' }],
			executeTool: async () => ({ success: true, data: [] })
		});
		expect(calls).toHaveLength(10);
		expect(r.stopReason).toBe('tool_use');
	});

	it('reports every response to onResponse', async () => {
		const { client } = fakeClient([
			msg([toolUse('t1', 'list_brands', {})], 'tool_use'),
			msg([text('ok')], 'end_turn')
		]);
		const seen: string[] = [];
		await runStitchTurn({
			...baseParams,
			client,
			messages: [{ role: 'user', content: 'x' }],
			executeTool: async () => ({ success: true, data: [] }),
			onResponse: (m) => seen.push(m.stop_reason ?? 'null')
		});
		expect(seen).toEqual(['tool_use', 'end_turn']);
	});
});
