import type Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase.js';
import { PROMPT_VERSION } from './ai-prompts.js';
import { defer } from './audit/defer.js';
import { logSupabaseError } from './log-supabase-error.js';
import { reportAiDegraded, reportAiValidation } from './ai-errors.js';
import {
	aiUsageRecordSchema,
	telemetryErrorText,
	type AiUsageRecord
} from '$lib/schemas/ai-telemetry.js';

type UsageContext = {
	endpoint: string;
	purpose: string;
	organizationId: string | null;
	userId?: string | null;
	/** Groups every call made for one user-visible request. */
	turnId?: string | null;
	conversationId?: string | null;
	latencyMs?: number | null;
};

export type UsageLogInput = UsageContext & {
	/**
	 * The model the caller asked for. Only a fallback: the row records
	 * `response.model`, which is what actually served the call.
	 */
	model?: string;
	response: Anthropic.Message;
};

export type UsageFailureInput = UsageContext & {
	model: string;
	error: unknown;
};

// Fire-and-forget usage logger. Never blocks the response path. The insert
// runs through defer so Vercel keeps the instance alive until it lands; a
// bare floating promise can be frozen mid-flight and the row silently lost.
// A failed insert is reported, never thrown: spend data must not cost the
// user their answer.
export function logUsage(input: UsageLogInput): void {
	const usage = input.response.usage;
	// A cut-off response is still a 200. Flag it here so every endpoint is
	// covered, not just the ones that remember to check.
	if (input.response.stop_reason === 'max_tokens') {
		reportAiDegraded('max_tokens', {
			endpoint: input.endpoint,
			purpose: input.purpose,
			organizationId: input.organizationId,
			extra: { turnId: input.turnId ?? null, model: input.response.model }
		});
	}
	writeUsage({
		...baseRecord(input),
		model: input.response.model || input.model || 'unknown',
		input_tokens: usage?.input_tokens ?? null,
		output_tokens: usage?.output_tokens ?? null,
		cache_read_tokens: usage?.cache_read_input_tokens ?? null,
		cache_creation_tokens: usage?.cache_creation_input_tokens ?? null,
		stop_reason: input.response.stop_reason ?? null,
		status: 'ok',
		error: null
	});
}

/** Record a model call that threw. Without this, failures left no row at all. */
export function logUsageFailure(input: UsageFailureInput): void {
	writeUsage({
		...baseRecord(input),
		model: input.model,
		input_tokens: null,
		output_tokens: null,
		cache_read_tokens: null,
		cache_creation_tokens: null,
		stop_reason: null,
		status: 'error',
		error: telemetryErrorText(input.error)
	});
}

/**
 * `messages.create` with telemetry: times the call and writes one usage row
 * whether it returns or throws. Errors are rethrown unchanged.
 */
export async function createTracked(
	anthropic: Anthropic,
	params: Anthropic.MessageCreateParamsNonStreaming,
	context: Omit<UsageContext, 'latencyMs'>
): Promise<Anthropic.Message> {
	// A lone call is its own turn; loops pass one id for every iteration.
	const tracked = { ...context, turnId: context.turnId ?? randomUUID() };
	const started = Date.now();
	try {
		const response = await anthropic.messages.create(params);
		logUsage({ ...tracked, model: params.model, response, latencyMs: Date.now() - started });
		return response;
	} catch (err) {
		logUsageFailure({
			...tracked,
			model: params.model,
			error: err,
			latencyMs: Date.now() - started
		});
		throw err;
	}
}

function baseRecord(input: UsageContext) {
	return {
		organization_id: input.organizationId,
		user_id: input.userId ?? null,
		endpoint: input.endpoint,
		purpose: input.purpose,
		prompt_version: PROMPT_VERSION,
		turn_id: input.turnId ?? null,
		conversation_id: input.conversationId ?? null,
		latency_ms: input.latencyMs == null ? null : Math.max(0, Math.round(input.latencyMs))
	};
}

function writeUsage(candidate: AiUsageRecord): void {
	const parsed = aiUsageRecordSchema.safeParse(candidate);
	if (!parsed.success) {
		// A record we built that fails our own contract is a bug in the writer.
		// Report it; never insert a row the dashboards would misread.
		reportAiValidation({
			endpoint: 'telemetry',
			purpose: 'ai_usage_logs',
			organizationId: candidate.organization_id,
			failed: 1,
			total: 1,
			issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
		});
		return;
	}

	// Console log for fast local iteration / log aggregation
	console.log('AI usage', parsed.data);

	void defer(async () => {
		const { error } = await supabaseAdmin.from('ai_usage_logs').insert(parsed.data);
		logSupabaseError('ai_usage_logs insert', error);
	});
}
