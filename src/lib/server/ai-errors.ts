import * as Sentry from '@sentry/sveltekit';

export type AiErrorContext = {
	/** Same value the call site passes to logUsage, e.g. 'briefing', 'agent'. */
	endpoint: string;
	purpose?: string;
	organizationId?: string | null;
	extra?: Record<string, unknown>;
};

/**
 * Surface a failed AI call to both the console and Sentry, tagged so AI
 * failures can be filtered by endpoint and org rather than hunted for in
 * Vercel logs.
 *
 * Safe to call before rethrowing: Sentry marks the error object as captured,
 * so the global handleError will not report it a second time, and this tagged
 * event is the one that lands.
 */
export function reportAiError(err: unknown, ctx: AiErrorContext): void {
	const label = ctx.purpose ? `${ctx.endpoint}/${ctx.purpose}` : ctx.endpoint;
	console.error(`[ai] ${label} failed:`, err);

	const tags: Record<string, string> = { subsystem: 'ai', ai_endpoint: ctx.endpoint };
	if (ctx.purpose) tags.ai_purpose = ctx.purpose;
	if (ctx.organizationId) tags.organization_id = ctx.organizationId;

	Sentry.captureException(err, { tags, extra: ctx.extra });
}

export type AiValidationContext = AiErrorContext & {
	/** Items that failed the schema. */
	failed: number;
	/** Items the model returned in total. */
	total: number;
	/** A few issue strings, enough to see the pattern without the payload. */
	issues: string[];
};

/**
 * Record model output that failed its schema. Not an exception (the caller
 * handles the bad items), so it goes to Sentry as a warning grouped per
 * endpoint and purpose: the issue's event count is the "how often does the
 * model get this wrong" number.
 */
export function reportAiValidation(ctx: AiValidationContext): void {
	if (ctx.failed === 0) return;

	const label = ctx.purpose ? `${ctx.endpoint}/${ctx.purpose}` : ctx.endpoint;
	console.warn(`[ai] ${label} output failed validation: ${ctx.failed} of ${ctx.total}`);

	const tags: Record<string, string> = { subsystem: 'ai', ai_endpoint: ctx.endpoint };
	if (ctx.purpose) tags.ai_purpose = ctx.purpose;
	if (ctx.organizationId) tags.organization_id = ctx.organizationId;

	Sentry.captureMessage(`[ai] ${label} output failed validation`, {
		level: 'warning',
		tags,
		fingerprint: ['ai-validation', ctx.endpoint, ctx.purpose ?? ''],
		extra: { ...ctx.extra, failed: ctx.failed, total: ctx.total, issues: ctx.issues.slice(0, 10) }
	});
}

export type AiDegradedKind =
	| 'iteration_cap'
	| 'max_tokens'
	| 'model_refusal'
	| 'classifier_unrecognized'
	| 'suggestions_unparseable';

/**
 * Record a turn that "succeeded" but not the way it should have: the tool loop
 * ran out of iterations, a response was cut off at max_tokens, the model's
 * safety classifiers declined the request (stop_reason "refusal"), the classifier
 * answered with neither label, or the suggestions line did not parse. None of
 * these throw, so without this they were invisible. A Sentry warning grouped
 * by kind and endpoint; the event count is the rate.
 */
export function reportAiDegraded(kind: AiDegradedKind, ctx: AiErrorContext): void {
	const label = ctx.purpose ? `${ctx.endpoint}/${ctx.purpose}` : ctx.endpoint;
	console.warn(`[ai] ${label} degraded: ${kind}`);

	const tags: Record<string, string> = {
		subsystem: 'ai',
		ai_endpoint: ctx.endpoint,
		ai_degraded: kind
	};
	if (ctx.purpose) tags.ai_purpose = ctx.purpose;
	if (ctx.organizationId) tags.organization_id = ctx.organizationId;

	Sentry.captureMessage(`[ai] ${label} degraded: ${kind}`, {
		level: 'warning',
		tags,
		fingerprint: ['ai-degraded', kind, ctx.endpoint],
		extra: ctx.extra
	});
}

export type AiRefusalScope = 'user_rate' | 'org_rate' | 'org_budget';

/**
 * Record a request the AI limiter refused. Grouped by scope only, not by
 * endpoint, so each scope is one Sentry issue whose event count is the refusal
 * rate across every AI surface: that is what the refusal-spike alert counts.
 * The endpoint and org ride along as tags for drilling in.
 */
export function reportAiRefused(scope: AiRefusalScope, ctx: AiErrorContext): void {
	console.warn(`[ai] ${ctx.endpoint} refused: ${scope}`);

	const tags: Record<string, string> = {
		subsystem: 'ai',
		ai_endpoint: ctx.endpoint,
		ai_refused: scope
	};
	if (ctx.organizationId) tags.organization_id = ctx.organizationId;

	Sentry.captureMessage(`[ai] request refused: ${scope}`, {
		level: 'warning',
		tags,
		fingerprint: ['ai-refused', scope],
		extra: ctx.extra
	});
}
