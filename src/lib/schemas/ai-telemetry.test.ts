import { describe, it, expect } from 'vitest';
import {
	aiUsageRecordSchema,
	aiToolCallRecordSchema,
	telemetryErrorText,
	TELEMETRY_ERROR_MAX
} from './ai-telemetry.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const TURN = '22222222-2222-4222-8222-222222222222';

const usage = {
	organization_id: ORG,
	user_id: null,
	endpoint: 'briefing',
	purpose: 'briefing',
	model: 'claude-haiku-4-5',
	prompt_version: '3.3.0',
	input_tokens: 120,
	output_tokens: 40,
	cache_read_tokens: 0,
	cache_creation_tokens: 0,
	turn_id: TURN,
	conversation_id: null,
	latency_ms: 812,
	stop_reason: 'end_turn',
	status: 'ok' as const,
	error: null
};

const toolCall = {
	organization_id: ORG,
	user_id: null,
	turn_id: TURN,
	endpoint: 'chat',
	tool: 'create_order',
	status: 'ok' as const,
	denial_reason: null,
	error: null,
	latency_ms: 95
};

describe('aiUsageRecordSchema', () => {
	it('accepts a successful call', () => {
		expect(aiUsageRecordSchema.safeParse(usage).success).toBe(true);
	});

	it('accepts a failed call with null tokens and an error', () => {
		const failed = {
			...usage,
			input_tokens: null,
			output_tokens: null,
			stop_reason: null,
			status: 'error' as const,
			error: 'APIConnectionError: Connection error.'
		};
		expect(aiUsageRecordSchema.safeParse(failed).success).toBe(true);
	});

	it('ties error text to status, both ways', () => {
		expect(aiUsageRecordSchema.safeParse({ ...usage, status: 'error' }).success).toBe(false);
		expect(aiUsageRecordSchema.safeParse({ ...usage, error: 'x' }).success).toBe(false);
	});

	it('keeps stop_reason open to values Anthropic adds later', () => {
		expect(
			aiUsageRecordSchema.safeParse({ ...usage, stop_reason: 'some_new_reason' }).success
		).toBe(true);
	});

	it('rejects negative counts and non-uuid ids', () => {
		expect(aiUsageRecordSchema.safeParse({ ...usage, output_tokens: -1 }).success).toBe(false);
		expect(aiUsageRecordSchema.safeParse({ ...usage, latency_ms: -5 }).success).toBe(false);
		expect(aiUsageRecordSchema.safeParse({ ...usage, turn_id: 'turn-1' }).success).toBe(false);
	});
});

describe('aiToolCallRecordSchema', () => {
	it('accepts each status with its required companion fields', () => {
		expect(aiToolCallRecordSchema.safeParse(toolCall).success).toBe(true);
		expect(
			aiToolCallRecordSchema.safeParse({
				...toolCall,
				status: 'denied',
				denial_reason: 'guest_read_only'
			}).success
		).toBe(true);
		expect(
			aiToolCallRecordSchema.safeParse({ ...toolCall, status: 'invalid', error: 'lines: Required' })
				.success
		).toBe(true);
	});

	it('requires a denial reason exactly when denied', () => {
		expect(aiToolCallRecordSchema.safeParse({ ...toolCall, status: 'denied' }).success).toBe(false);
		expect(
			aiToolCallRecordSchema.safeParse({ ...toolCall, denial_reason: 'brand_scope' }).success
		).toBe(false);
	});

	it('rejects statuses and reasons outside the set', () => {
		expect(aiToolCallRecordSchema.safeParse({ ...toolCall, status: 'skipped' }).success).toBe(
			false
		);
		expect(
			aiToolCallRecordSchema.safeParse({
				...toolCall,
				status: 'denied',
				denial_reason: 'rate_limit'
			}).success
		).toBe(false);
	});
});

describe('telemetryErrorText', () => {
	it('keeps the error name and message, not the stack', () => {
		const err = new TypeError('bad input');
		expect(telemetryErrorText(err)).toBe('TypeError: bad input');
	});

	it('caps long messages', () => {
		const text = telemetryErrorText('x'.repeat(2000));
		expect(text).toHaveLength(TELEMETRY_ERROR_MAX);
		expect(text.endsWith('…')).toBe(true);
	});

	it('never returns empty text for odd throws', () => {
		expect(telemetryErrorText({ code: 500 })).toBe('Unknown error');
		expect(telemetryErrorText('   ')).toBe('Unknown error');
	});
});
