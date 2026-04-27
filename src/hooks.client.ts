import * as Sentry from '@sentry/sveltekit';
import { PUBLIC_SENTRY_DSN } from '$env/static/public';
import { dev } from '$app/environment';

Sentry.init({
	dsn: PUBLIC_SENTRY_DSN,
	enabled: !dev,
	environment: import.meta.env.VERCEL_ENV ?? (dev ? 'development' : 'production'),
	tracesSampleRate: 0.1,
	replaysSessionSampleRate: 0.1,
	replaysOnErrorSampleRate: 1.0,
	integrations: [Sentry.replayIntegration()],
	beforeSend(event, hint) {
		const err = hint?.originalException as
			| { status?: number; location?: string; body?: { message?: string } }
			| undefined;

		// SvelteKit `error(404, …)` / `redirect(303, …)` aren't bugs — don't page on them.
		if (err && typeof err === 'object') {
			if (typeof err.status === 'number' && err.status >= 300 && err.status < 500) return null;
			if (typeof err.location === 'string') return null;
		}

		return event;
	}
});

export const handleError = Sentry.handleErrorWithSentry();
