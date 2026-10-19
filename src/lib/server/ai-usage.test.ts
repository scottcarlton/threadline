import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const insert = vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>(async () => ({
	error: null
}));
const reportAiValidation = vi.fn();

vi.mock('./supabase.js', () => ({ supabaseAdmin: { from: () => ({ insert }) } }));
vi.mock('./log-supabase-error.js', () => ({ logSupabaseError: vi.fn() }));
vi.mock('./ai-errors.js', () => ({ reportAiValidation }));
// Run deferred work inline so assertions do not race the insert.
vi.mock('./audit/defer.js', () => ({ defer: async (work: () => Promise<void>) => work() }));

const { logUsage, logUsageFailure, createTracked } = await import('./ai-usage.js');

const ORG = '11111111-1111-4111-8111-111111111111';
const TURN = '22222222-2222-4222-8222-222222222222';

function message(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
	return {
		id: 'msg_1',
		type: 'message',
		role: 'assistant',
		model: 'claude-haiku-4-5-20251001',
		content: [],
		stop_reason: 'end_turn',
		stop_sequence: null,
		usage: {
			input_tokens: 100,
			output_tokens: 20,
			cache_read_input_tokens: 5,
			cache_creation_input_tokens: 0
		},
		...overrides
	} as Anthropic.Message;
}

function lastRow() {
	return insert.mock.calls.at(-1)![0];
}

beforeEach(() => {
	insert.mockClear();
	reportAiValidation.mockClear();
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('logUsage', () => {
	it('records the model that served the call, not the one requested', () => {
		logUsage({
			endpoint: 'briefing',
			purpose: 'briefing',
			model: 'claude-haiku-4-5',
			organizationId: ORG,
			response: message()
		});

		expect(lastRow()).toMatchObject({
			model: 'claude-haiku-4-5-20251001',
			stop_reason: 'end_turn',
			status: 'ok',
			error: null,
			input_tokens: 100,
			cache_read_tokens: 5
		});
	});

	it('records truncation instead of hiding it', () => {
		logUsage({
			endpoint: 'chat',
			purpose: 'tools',
			organizationId: ORG,
			response: message({ stop_reason: 'max_tokens' })
		});

		expect(lastRow().stop_reason).toBe('max_tokens');
	});

	it('refuses to insert a row that breaks the contract, and reports it', () => {
		logUsage({
			endpoint: 'briefing',
			purpose: 'briefing',
			organizationId: 'not-a-uuid',
			response: message()
		});

		expect(insert).not.toHaveBeenCalled();
		expect(reportAiValidation).toHaveBeenCalledWith(
			expect.objectContaining({ endpoint: 'telemetry', purpose: 'ai_usage_logs' })
		);
	});
});

describe('logUsageFailure', () => {
	it('writes an error row with null tokens', () => {
		logUsageFailure({
			endpoint: 'linesheet',
			purpose: 'parse_products',
			model: 'claude-sonnet-4-6',
			organizationId: ORG,
			error: new Error('Overloaded'),
			latencyMs: 30_000
		});

		expect(lastRow()).toMatchObject({
			status: 'error',
			error: 'Error: Overloaded',
			input_tokens: null,
			output_tokens: null,
			latency_ms: 30_000
		});
	});
});

describe('createTracked', () => {
	const params = {
		model: 'claude-haiku-4-5',
		max_tokens: 10,
		messages: [{ role: 'user' as const, content: 'hi' }]
	};

	it('times a successful call and keeps the caller turn id', async () => {
		const create = vi.fn(async () => message());
		const client = { messages: { create } } as unknown as Anthropic;

		const result = await createTracked(client, params, {
			endpoint: 'agent',
			purpose: 'agent',
			organizationId: ORG,
			turnId: TURN
		});

		expect(result.id).toBe('msg_1');
		expect(lastRow()).toMatchObject({ status: 'ok', turn_id: TURN });
		expect(lastRow().latency_ms).toBeGreaterThanOrEqual(0);
	});

	it('gives a lone call its own turn id', async () => {
		const client = { messages: { create: async () => message() } } as unknown as Anthropic;

		await createTracked(client, params, {
			endpoint: 'briefing',
			purpose: 'briefing',
			organizationId: ORG
		});

		expect(lastRow().turn_id).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('logs a failure row and rethrows the original error', async () => {
		const boom = new Error('Connection error.');
		const client = {
			messages: {
				create: async () => {
					throw boom;
				}
			}
		} as unknown as Anthropic;

		await expect(
			createTracked(client, params, {
				endpoint: 'briefing',
				purpose: 'briefing',
				organizationId: ORG,
				turnId: TURN
			})
		).rejects.toBe(boom);

		expect(lastRow()).toMatchObject({
			status: 'error',
			error: 'Error: Connection error.',
			model: 'claude-haiku-4-5',
			turn_id: TURN
		});
	});
});
