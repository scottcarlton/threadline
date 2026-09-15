/**
 * SvelteKit handle that gives every request an audit recorder.
 *
 * Placed before the auth handle in the sequence so `locals.audit` exists for
 * all downstream code, including the auth handle itself. Nothing is written
 * unless a handler actually records a named event, so read-only traffic costs
 * exactly one object allocation.
 */
import type { Handle } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { AuditRecorder } from './recorder.js';
import { defer } from './defer.js';

/** A thrown SvelteKit redirect carries a status and a location. */
function statusOfThrown(err: unknown): number | null {
	if (err && typeof err === 'object') {
		const e = err as { status?: unknown; location?: unknown };
		if (typeof e.status === 'number') return e.status;
	}
	return null;
}

export const auditHandle: Handle = async ({ event, resolve }) => {
	const startedAt = Date.now();

	const recorder = new AuditRecorder(
		{
			route: event.route.id,
			method: event.request.method,
			ip: safeClientAddress(event),
			userAgent: event.request.headers.get('user-agent'),
			requestId: event.request.headers.get('x-vercel-id') ?? crypto.randomUUID(),
			correlationId: crypto.randomUUID()
		},
		supabaseAdmin,
		(err) => {
			// An audit write failing is itself an incident: it must be visible, but
			// it must never break the request that produced it.
			Sentry.captureException(err, { tags: { subsystem: 'audit' } });
		}
	);

	event.locals.audit = recorder;

	const flush = async (httpStatus: number | null) => {
		if (!recorder.hasEvents()) return;
		await defer(() => recorder.flush({ httpStatus, durationMs: Date.now() - startedAt }));
	};

	try {
		const response = await resolve(event);
		await flush(response.status);
		return response;
	} catch (err) {
		// Redirects and errors are outcomes too; record them before rethrowing.
		await flush(statusOfThrown(err) ?? 500);
		throw err;
	}
};

function safeClientAddress(event: Parameters<Handle>[0]['event']): string | null {
	try {
		return event.getClientAddress();
	} catch {
		// Not available in every adapter/runtime (and never in vitest).
		return null;
	}
}
