/**
 * Rate limits and spend caps for the AI endpoints.
 *
 * Before this, nothing limited `/api/ai`, `/api/ai/briefing`, or
 * `/api/products/parse-linesheet`. A signed-in session could loop chat as fast
 * as the network allowed, and each request can fan out to ten sonnet round
 * trips. ai_usage_logs recorded the spend; nothing read it back.
 *
 * Three ceilings, checked in order of how cheap they are to reason about:
 *   1. per-user request rate  — one person hammering the endpoint
 *   2. per-org request rate   — one org's whole team, or a shared script
 *   3. per-org daily tokens   — the actual money, summed from ai_usage_logs
 *
 * The token budget is a hard refusal rather than a silent downgrade to a
 * cheaper model. An org that has spent its day's budget should be told, not
 * quietly served worse answers it cannot distinguish from good ones.
 */
import { supabaseAdmin } from './supabase.js';

export type AiLimitConfig = {
	userPerMinute: number;
	orgPerMinute: number;
	orgDailyTokens: number;
};

export const DEFAULT_AI_LIMITS: AiLimitConfig = {
	// A person types one message at a time. Twenty a minute is far beyond human
	// pace and still leaves headroom for retries and a double-click.
	userPerMinute: 20,
	// A whole org on a busy show day, with room to spare.
	orgPerMinute: 60,
	// Input plus output across every AI surface. Roughly a few hundred heavy
	// chat turns, which no real org reaches in a day.
	orgDailyTokens: 5_000_000
};

export type AiLimitCounts = {
	userLastMinute: number;
	orgLastMinute: number;
	orgTokensToday: number;
};

export type AiLimitVerdict =
	| { allowed: true }
	| {
			allowed: false;
			scope: 'user_rate' | 'org_rate' | 'org_budget';
			/** What the caller should be told. Safe to surface verbatim. */
			message: string;
			/** Seconds to wait, for the Retry-After header. */
			retryAfter: number;
	  };

/** Seconds until the next UTC midnight, when the daily token budget resets. */
export function secondsUntilDailyReset(now: Date): number {
	const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
	return Math.max(1, Math.ceil((reset - now.getTime()) / 1000));
}

/**
 * Pure decision half, so the thresholds are testable without a database.
 * Rate ceilings are checked before the budget: a caller who is both looping and
 * out of budget should be told to slow down, since that is the recoverable one.
 */
export function decideAiLimit(
	counts: AiLimitCounts,
	config: AiLimitConfig = DEFAULT_AI_LIMITS,
	now: Date = new Date()
): AiLimitVerdict {
	if (counts.userLastMinute >= config.userPerMinute) {
		return {
			allowed: false,
			scope: 'user_rate',
			message: 'You are sending requests faster than Stitch can answer. Give it a moment.',
			retryAfter: 60
		};
	}

	if (counts.orgLastMinute >= config.orgPerMinute) {
		return {
			allowed: false,
			scope: 'org_rate',
			message: 'Your team is sending a lot of requests at once. Try again shortly.',
			retryAfter: 60
		};
	}

	if (counts.orgTokensToday >= config.orgDailyTokens) {
		return {
			allowed: false,
			scope: 'org_budget',
			message:
				'Your organization has reached its AI usage limit for today. It resets at midnight UTC, or contact us if you need it raised.',
			retryAfter: secondsUntilDailyReset(now)
		};
	}

	return { allowed: true };
}

/**
 * Count the three windows, decide, and record the request when it is allowed.
 *
 * The request row is written before the model is called, so a burst is counted
 * as it happens rather than after the fact. A refused request is not recorded:
 * being refused should not extend the window that refused you.
 */
export async function checkAiLimits(
	organizationId: string,
	userId: string,
	endpoint: string,
	config: AiLimitConfig = DEFAULT_AI_LIMITS
): Promise<AiLimitVerdict> {
	const now = new Date();
	const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
	const startOfDay = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
	).toISOString();

	const [userRate, orgRate, usage] = await Promise.all([
		supabaseAdmin
			.from('ai_requests')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', userId)
			.gte('created_at', oneMinuteAgo),
		supabaseAdmin
			.from('ai_requests')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', organizationId)
			.gte('created_at', oneMinuteAgo),
		supabaseAdmin
			.from('ai_usage_logs')
			.select('input_tokens, output_tokens')
			.eq('organization_id', organizationId)
			.gte('created_at', startOfDay)
	]);

	const rows = (usage.data ?? []) as Array<{
		input_tokens: number | null;
		output_tokens: number | null;
	}>;
	const orgTokensToday = rows.reduce(
		(sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
		0
	);

	const verdict = decideAiLimit(
		{
			userLastMinute: userRate.count ?? 0,
			orgLastMinute: orgRate.count ?? 0,
			orgTokensToday
		},
		config,
		now
	);

	if (verdict.allowed) {
		const { error } = await supabaseAdmin
			.from('ai_requests')
			.insert({ organization_id: organizationId, user_id: userId, endpoint });
		// A counter we failed to write means the next check undercounts. Say so
		// rather than swallowing it, but do not refuse a legitimate request over
		// bookkeeping.
		if (error) console.error('[ai-limits] request counter insert failed:', error.message);
	}

	return verdict;
}
