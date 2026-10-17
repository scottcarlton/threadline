import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>(async () => ({
	error: null
}));
const reportAiValidation = vi.fn();

vi.mock('./supabase.js', () => ({ supabaseAdmin: { from: () => ({ insert }) } }));
vi.mock('./log-supabase-error.js', () => ({ logSupabaseError: vi.fn() }));
vi.mock('./ai-errors.js', () => ({ reportAiValidation }));
vi.mock('./audit/defer.js', () => ({ defer: async (work: () => Promise<void>) => work() }));

const { logToolCall } = await import('./ai-tool-calls.js');

const ORG = '11111111-1111-4111-8111-111111111111';
const TURN = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
	insert.mockClear();
	reportAiValidation.mockClear();
});

describe('logToolCall', () => {
	it('writes a denied call with its reason', () => {
		logToolCall({
			organizationId: ORG,
			turnId: TURN,
			endpoint: 'chat',
			tool: 'create_order',
			status: 'denied',
			denialReason: 'guest_read_only'
		});

		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({
				tool: 'create_order',
				status: 'denied',
				denial_reason: 'guest_read_only',
				error: null
			})
		);
	});

	it('stores a failed tool result as short error text', () => {
		logToolCall({
			organizationId: ORG,
			turnId: TURN,
			endpoint: 'agent',
			tool: 'send_email',
			status: 'error',
			error: 'Gmail not connected',
			latencyMs: 41.7
		});

		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'Gmail not connected', latency_ms: 42 })
		);
	});

	it('drops and reports a record that breaks the contract', () => {
		logToolCall({
			organizationId: ORG,
			turnId: TURN,
			endpoint: 'chat',
			tool: 'create_order',
			status: 'denied'
		});

		expect(insert).not.toHaveBeenCalled();
		expect(reportAiValidation).toHaveBeenCalledWith(
			expect.objectContaining({ endpoint: 'telemetry', purpose: 'ai_tool_calls' })
		);
	});
});
