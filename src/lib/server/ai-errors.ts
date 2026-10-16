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
