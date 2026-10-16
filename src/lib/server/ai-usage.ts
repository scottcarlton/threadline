import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase.js';
import { PROMPT_VERSION } from './ai-prompts.js';
import { defer } from './audit/defer.js';
import { logSupabaseError } from './log-supabase-error.js';

export type UsageLogInput = {
	endpoint: string;
	organizationId: string | null;
	userId?: string | null;
	model: string;
	purpose: string;
	response: Anthropic.Message;
};

// Fire-and-forget usage logger. Never blocks the response path. The insert
// runs through defer so Vercel keeps the instance alive until it lands; a
// bare floating promise can be frozen mid-flight and the row silently lost.
// A failed insert is reported, never thrown: spend data must not cost the
// user their answer.
export function logUsage(input: UsageLogInput): void {
	const usage = input.response.usage;
	const record = {
		organization_id: input.organizationId,
		user_id: input.userId ?? null,
		endpoint: input.endpoint,
		purpose: input.purpose,
		model: input.model,
		prompt_version: PROMPT_VERSION,
		input_tokens: usage?.input_tokens ?? null,
		output_tokens: usage?.output_tokens ?? null,
		cache_read_tokens: usage?.cache_read_input_tokens ?? null,
		cache_creation_tokens: usage?.cache_creation_input_tokens ?? null
	};

	// Console log for fast local iteration / log aggregation
	console.log('AI usage', record);

	void defer(async () => {
		const { error } = await supabaseAdmin.from('ai_usage_logs').insert(record);
		logSupabaseError('ai_usage_logs insert', error);
	});
}
