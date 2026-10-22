// src/lib/server/stitch/telemetry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const logUsage = vi.fn();
const logUsageFailure = vi.fn();
const logToolCall = vi.fn();
vi.mock('../ai-usage.js', () => ({ logUsage, logUsageFailure }));
vi.mock('../ai-tool-calls.js', () => ({ logToolCall }));

const { trackedClient, trackedToolExecutor, logToolDenial, logToolInvalid } =
	await import('./telemetry.js');

const ctx = {
	endpoint: 'chat',
	organizationId: '11111111-1111-4111-8111-111111111111',
	userId: '33333333-3333-4333-8333-333333333333',
	turnId: '22222222-2222-4222-8222-222222222222',
	conversationId: '44444444-4444-4444-8444-444444444444'
};

const message = {
	id: 'm',
	model: 'claude-sonnet-4-6',
	stop_reason: 'end_turn'
} as Anthropic.Message;
const params = { model: 'claude-sonnet-4-6', max_tokens: 10, messages: [] };

beforeEach(() => {
	logUsage.mockClear();
	logUsageFailure.mockClear();
	logToolCall.mockClear();
});

describe('trackedClient', () => {
	it('logs a create call against the turn, with purpose and latency', async () => {
		const anthropic = { messages: { create: async () => message } } as never;
		const client = trackedClient(anthropic, { ...ctx, purpose: 'classifier' });

		expect(await client.messages.create(params)).toBe(message);
		expect(logUsage).toHaveBeenCalledWith(
			expect.objectContaining({
				purpose: 'classifier',
				turnId: ctx.turnId,
				conversationId: ctx.conversationId,
				response: message,
				latencyMs: expect.any(Number)
			})
		);
	});

	it('writes a failure row when create throws, then rethrows', async () => {
		const boom = new Error('overloaded');
		const anthropic = {
			messages: {
				create: async () => {
					throw boom;
				}
			}
		} as never;
		const client = trackedClient(anthropic, { ...ctx, purpose: 'chat' });

		await expect(client.messages.create(params)).rejects.toBe(boom);
		expect(logUsageFailure).toHaveBeenCalledWith(
			expect.objectContaining({ purpose: 'chat', error: boom, model: 'claude-sonnet-4-6' })
		);
	});

	it('passes stream text through and logs when the final message lands', async () => {
		const deltas: string[] = [];
		const anthropic = {
			messages: {
				stream: () => {
					let cb: (d: string) => void = () => {};
					return {
						on: (_e: string, fn: (d: string) => void) => {
							cb = fn;
						},
						finalMessage: async () => {
							cb('Hello');
							return message;
						}
					};
				}
			}
		} as never;
		const s = trackedClient(anthropic, { ...ctx, purpose: 'tools' }).messages.stream(params);
		s.on('text', (d) => deltas.push(d));

		expect(await s.finalMessage()).toBe(message);
		expect(deltas).toEqual(['Hello']);
		expect(logUsage).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'tools' }));
	});

	it('writes a failure row when a stream fails', async () => {
		const anthropic = {
			messages: {
				stream: () => ({
					on: () => {},
					finalMessage: async () => {
						throw new Error('stream reset');
					}
				})
			}
		} as never;
		const s = trackedClient(anthropic, { ...ctx, purpose: 'tools' }).messages.stream(params);

		await expect(s.finalMessage()).rejects.toThrow('stream reset');
		expect(logUsageFailure).toHaveBeenCalledOnce();
		expect(logUsage).not.toHaveBeenCalled();
	});
});

describe('trackedToolExecutor', () => {
	it('logs a successful call as ok', async () => {
		const run = trackedToolExecutor(async () => ({ success: true, data: [] }), ctx);
		await run('list_brands', {});

		expect(logToolCall).toHaveBeenCalledWith(
			expect.objectContaining({
				tool: 'list_brands',
				status: 'ok',
				error: null,
				turnId: ctx.turnId
			})
		);
	});

	it('logs a success:false result as an error with its message', async () => {
		const run = trackedToolExecutor(
			async () => ({ success: false, error: 'Account not found' }),
			ctx
		);
		const result = await run('create_order', {});

		expect(result.success).toBe(false);
		expect(logToolCall).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'error', error: 'Account not found' })
		);
	});

	it('logs a throw as an error and rethrows it', async () => {
		const boom = new Error('db down');
		const run = trackedToolExecutor(async () => {
			throw boom;
		}, ctx);

		await expect(run('query_data', {})).rejects.toBe(boom);
		expect(logToolCall).toHaveBeenCalledWith(
			expect.objectContaining({ tool: 'query_data', status: 'error', error: boom })
		);
	});
});

describe('logToolDenial', () => {
	it('records the refusal and its reason', () => {
		logToolDenial(ctx, 'create_order', 'guest_read_only');

		expect(logToolCall).toHaveBeenCalledWith(
			expect.objectContaining({
				tool: 'create_order',
				status: 'denied',
				denialReason: 'guest_read_only'
			})
		);
	});
});

describe('logToolInvalid', () => {
	it('records a schema failure as invalid, with the issues as its error', () => {
		logToolInvalid(ctx, 'create_order', 'Invalid input for create_order. lines: Required');

		expect(logToolCall).toHaveBeenCalledWith(
			expect.objectContaining({
				tool: 'create_order',
				status: 'invalid',
				error: 'Invalid input for create_order. lines: Required'
			})
		);
	});
});
