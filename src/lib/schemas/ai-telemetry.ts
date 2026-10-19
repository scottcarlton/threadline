import { z } from 'zod';

// Row contracts for the AI telemetry tables. Writers build a record, parse it
// here, and only insert what passes, so the dashboards read rows that mean
// what they say. The CHECK constraints in 20261017000001_ai_telemetry.sql are
// the database's half of the same rules; keep the two in step.

/** Longest error text stored. Enough to diagnose, too short to carry a payload. */
export const TELEMETRY_ERROR_MAX = 500;

const uuid = z.string().uuid();
const tokenCount = z.number().int().nonnegative().nullable();
const latency = z.number().int().nonnegative().nullable();
const label = z.string().min(1).max(64);
const errorText = z.string().min(1).max(TELEMETRY_ERROR_MAX).nullable();

export const aiUsageRecordSchema = z
	.object({
		organization_id: uuid.nullable(),
		user_id: uuid.nullable(),
		endpoint: label,
		purpose: label,
		model: z.string().min(1).max(128),
		prompt_version: z.string().min(1).nullable(),
		input_tokens: tokenCount,
		output_tokens: tokenCount,
		cache_read_tokens: tokenCount,
		cache_creation_tokens: tokenCount,
		turn_id: uuid.nullable(),
		conversation_id: uuid.nullable(),
		latency_ms: latency,
		// Anthropic's value, verbatim; see the migration for why it is open.
		stop_reason: z.string().min(1).max(64).nullable(),
		status: z.enum(['ok', 'error']),
		error: errorText
	})
	.refine((r) => (r.status === 'error') === (r.error !== null), {
		message: 'error is required on an error row and must be empty otherwise',
		path: ['error']
	});

export type AiUsageRecord = z.infer<typeof aiUsageRecordSchema>;

export const AI_TOOL_CALL_STATUSES = ['ok', 'error', 'denied', 'invalid'] as const;
export const AI_TOOL_DENIAL_REASONS = ['guest_read_only', 'brand_scope'] as const;

export const aiToolCallRecordSchema = z
	.object({
		organization_id: uuid,
		user_id: uuid.nullable(),
		turn_id: uuid,
		endpoint: label,
		tool: label,
		status: z.enum(AI_TOOL_CALL_STATUSES),
		denial_reason: z.enum(AI_TOOL_DENIAL_REASONS).nullable(),
		error: errorText,
		latency_ms: latency
	})
	.refine((r) => (r.status === 'denied') === (r.denial_reason !== null), {
		message: 'denial_reason is required on a denied call and must be empty otherwise',
		path: ['denial_reason']
	});

export type AiToolCallRecord = z.infer<typeof aiToolCallRecordSchema>;

/** Error text safe to store: a message, never a stack or an object dump. */
export function telemetryErrorText(err: unknown): string {
	const raw =
		err instanceof Error ? `${err.name}: ${err.message}` : typeof err === 'string' ? err : '';
	const text = raw.trim() || 'Unknown error';
	return text.length > TELEMETRY_ERROR_MAX ? `${text.slice(0, TELEMETRY_ERROR_MAX - 1)}…` : text;
}
