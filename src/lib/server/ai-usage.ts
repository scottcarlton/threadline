import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase.js';
import { PROMPT_VERSION } from './ai-prompts.js';

export type UsageLogInput = {
	endpoint: string;
	organizationId: string | null;
	userId?: string | null;
	model: string;
	purpose: string;
	response: Anthropic.Message;
};

// Fire-and-forget usage logger. Never blocks the response path — if the
// insert fails we swallow the error and keep serving the request.
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

	// Best-effort DB insert — swallow errors, don't block the caller
	void supabaseAdmin
		.from('ai_usage_logs')
		.insert(record)
		.then(({ error }) => {
			if (error) console.error('ai_usage_logs insert failed:', error.message);
		});
}
