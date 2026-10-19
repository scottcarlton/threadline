import { supabaseAdmin } from './supabase.js';
import { defer } from './audit/defer.js';
import { logSupabaseError } from './log-supabase-error.js';
import { reportAiValidation } from './ai-errors.js';
import {
	aiToolCallRecordSchema,
	telemetryErrorText,
	type AI_TOOL_CALL_STATUSES,
	type AI_TOOL_DENIAL_REASONS
} from '$lib/schemas/ai-telemetry.js';

export type ToolCallLogInput = {
	organizationId: string;
	userId?: string | null;
	turnId: string;
	endpoint: string;
	tool: string;
	status: (typeof AI_TOOL_CALL_STATUSES)[number];
	denialReason?: (typeof AI_TOOL_DENIAL_REASONS)[number] | null;
	/** An Error, a message, or a tool result's `error` string. */
	error?: unknown;
	latencyMs?: number | null;
};

/**
 * Record one tool call an AI agent attempted. Fire and forget through defer,
 * like logUsage: telemetry must never fail or slow the turn it describes.
 * Tool inputs are deliberately not stored; see the ai_tool_calls migration.
 */
export function logToolCall(input: ToolCallLogInput): void {
	const parsed = aiToolCallRecordSchema.safeParse({
		organization_id: input.organizationId,
		user_id: input.userId ?? null,
		turn_id: input.turnId,
		endpoint: input.endpoint,
		tool: input.tool,
		status: input.status,
		denial_reason: input.denialReason ?? null,
		error: input.error == null ? null : telemetryErrorText(input.error),
		latency_ms: input.latencyMs == null ? null : Math.max(0, Math.round(input.latencyMs))
	});

	if (!parsed.success) {
		reportAiValidation({
			endpoint: 'telemetry',
			purpose: 'ai_tool_calls',
			organizationId: input.organizationId,
			failed: 1,
			total: 1,
			issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
		});
		return;
	}

	void defer(async () => {
		const { error } = await supabaseAdmin.from('ai_tool_calls').insert(parsed.data);
		logSupabaseError('ai_tool_calls insert', error);
	});
}
