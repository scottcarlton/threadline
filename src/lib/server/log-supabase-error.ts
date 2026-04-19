import * as Sentry from '@sentry/sveltekit';

type SupabaseErrorLike =
	| {
			message?: string;
			code?: string;
			details?: string | null;
			hint?: string | null;
	  }
	| null
	| undefined;

/**
 * Surface a Supabase query error to both the dev console and Sentry so a
 * failed query never silently degrades to empty UI. Pass the `.error` from a
 * supabase-js response; no-ops when the error is null.
 */
export function logSupabaseError(context: string, error: SupabaseErrorLike) {
	if (!error) return;
	const payload = {
		context,
		code: error.code,
		message: error.message,
		details: error.details,
		hint: error.hint
	};
	console.error('[supabase]', context, payload);
	Sentry.captureException(new Error(`[supabase] ${context}: ${error.message ?? 'unknown error'}`), {
		extra: payload
	});
}
