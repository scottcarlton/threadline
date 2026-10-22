import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import { PUBLIC_SENTRY_DSN } from '$env/static/public';

// SvelteKit loads this file before any application code, so Sentry's module
// hooks are in place before the Anthropic SDK, Supabase, and other libraries
// are imported. Initializing in hooks.server.ts was too late for that: those
// libraries were already loaded and their calls produced no spans.
//
// Prompts and responses are not recorded on gen_ai spans: that follows
// sendDefaultPii, which stays off. Spans carry model, token counts, and timing.
Sentry.init({
	dsn: PUBLIC_SENTRY_DSN,
	enabled: !dev,
	environment: import.meta.env.VERCEL_ENV ?? (dev ? 'development' : 'production'),
	tracesSampleRate: 0.1,
	beforeSend(event, hint) {
		const err = hint?.originalException as
			| { status?: number; location?: string; body?: { message?: string } }
			| undefined;

		// SvelteKit `error(404, …)` and `redirect(303, …)` aren't bugs, so don't page on them.
		if (err && typeof err === 'object') {
			if (typeof err.status === 'number' && err.status >= 300 && err.status < 500) return null;
			if (typeof err.location === 'string') return null;
		}

		return event;
	}
});
