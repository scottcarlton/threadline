/**
 * Per-request audit recorder.
 *
 * One instance lives on `event.locals.audit` for the lifetime of a request.
 * Handlers call `record()` to name what happened; the hook calls `flush()`
 * once, after the response is sent, so the write costs the user nothing.
 *
 * Buffering per request is what makes correlation work: every event from one
 * request shares a `correlation_id`, so a multi-step action reads as one story
 * in the /system console instead of as scattered rows.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { auditEventDef, type AuditEventName } from './events.js';
import { redactRecord } from './redact.js';

export type ActorKind = 'user' | 'system_admin' | 'service' | 'integration' | 'anonymous';

export type AuditActor = {
	id: string | null;
	email: string | null;
	label: string | null;
	kind: ActorKind;
	/**
	 * Names the non-human principal for `kind: 'service'` runs (scheduled
	 * agents, cron, integration workers). The database requires it: a row may
	 * not be actor-less just because a machine produced it.
	 */
	service?: string | null;
	/** Set when a system admin is acting through another user's context. */
	onBehalfOf?: string | null;
};

/**
 * Identity for machine-driven work. Use at every entry point that runs without
 * a signed-in human: the agent executor, cron routes, integration event
 * handlers.
 */
export function serviceActor(name: string): AuditActor {
	return { id: null, email: null, label: name, kind: 'service', service: name };
}

export type AuditRequestContext = {
	route: string | null;
	method: string;
	ip: string | null;
	userAgent: string | null;
	requestId: string;
	correlationId: string;
};

export type RecordInput = {
	organizationId?: string | null;
	organizationName?: string | null;
	subjectType?: string | null;
	subjectId?: string | null;
	subjectLabel?: string | null;
	metadata?: Record<string, unknown> | null;
	/** Field-level diff: `{ status: { before: 'draft', after: 'submitted' } }`. */
	changes?: Record<string, { before?: unknown; after?: unknown }> | null;
	status?: 'success' | 'failure';
	errorCode?: string | null;
	errorMessage?: string | null;
};

type BufferedEvent = RecordInput & { eventName: AuditEventName };

export type AuditOutcome = { httpStatus: number | null; durationMs: number | null };

export type AuditRow = Record<string, unknown>;

/**
 * Turn buffered events into insertable rows. Pure, so the stamping rules
 * (outcome inheritance, redaction, subject defaulting) are unit-testable
 * without a database.
 */
export function buildAuditRows(
	events: BufferedEvent[],
	actor: AuditActor,
	ctx: AuditRequestContext,
	outcome: AuditOutcome,
	defaultOrganizationId: string | null,
	defaultOrganizationName: string | null = null
): AuditRow[] {
	// A request that failed marks any event that did not state its own outcome
	// as a failure. "What was the response" is the field incidents need most.
	const requestFailed = outcome.httpStatus !== null && outcome.httpStatus >= 400;

	return events.map((e) => ({
		actor_id: actor.id,
		actor_email: actor.email,
		actor_label: actor.label,
		actor_kind: actor.kind,
		actor_service: actor.service ?? null,
		on_behalf_of: actor.onBehalfOf ?? null,

		event_name: e.eventName,
		subject_type: e.subjectType ?? auditEventDef(e.eventName).subjectType ?? null,
		subject_id: e.subjectId ?? null,
		subject_label: e.subjectLabel ?? null,

		organization_id: e.organizationId ?? defaultOrganizationId,
		organization_name: e.organizationName ?? defaultOrganizationName,
		route: ctx.route,
		method: ctx.method,
		request_id: ctx.requestId,
		correlation_id: ctx.correlationId,
		ip: ctx.ip,
		user_agent: ctx.userAgent,

		status: e.status ?? (requestFailed ? 'failure' : 'success'),
		http_status: outcome.httpStatus,
		error_code: e.errorCode ?? null,
		error_message: e.errorMessage ?? null,
		duration_ms: outcome.durationMs,

		metadata: redactRecord(e.metadata) ?? {},
		changes: redactRecord(e.changes)
	}));
}

export class AuditRecorder {
	private events: BufferedEvent[] = [];
	private actor: AuditActor = { id: null, email: null, label: null, kind: 'anonymous' };
	private organizationId: string | null = null;
	private organizationName: string | null = null;
	private flushed = false;

	constructor(
		private readonly ctx: AuditRequestContext,
		private readonly admin: SupabaseClient,
		private readonly onError: (err: unknown) => void = () => {}
	) {}

	get correlationId(): string {
		return this.ctx.correlationId;
	}

	/** Called by the hook once auth has resolved who is making the request. */
	setActor(actor: AuditActor): void {
		this.actor = actor;
	}

	/** Default org stamped on events that do not name one themselves. */
	setOrganization(organizationId: string | null, organizationName: string | null = null): void {
		this.organizationId = organizationId;
		this.organizationName = organizationName;
	}

	/** Name something that happened. Buffers; never awaits, never throws. */
	record(eventName: AuditEventName, input: RecordInput = {}): void {
		if (this.flushed) {
			// Recording after flush would silently lose the event. Surface it
			// rather than dropping it, but still do not disrupt the request.
			this.onError(new Error(`audit: '${eventName}' recorded after flush`));
			return;
		}
		this.events.push({ ...input, eventName });
	}

	hasEvents(): boolean {
		return this.events.length > 0;
	}

	/**
	 * Write the buffer. Called once per request from the hook, after the
	 * response is sent. Failures are reported, never thrown: a broken audit
	 * write must not turn a working request into a 500.
	 */
	async flush(outcome: AuditOutcome): Promise<void> {
		if (this.flushed || this.events.length === 0) return;
		this.flushed = true;

		const rows = buildAuditRows(
			this.events,
			this.actor,
			this.ctx,
			outcome,
			this.organizationId,
			this.organizationName
		);
		this.events = [];

		try {
			const { error } = await this.admin.from('audit_log').insert(rows);
			if (error) this.onError(error);
		} catch (err) {
			this.onError(err);
		}
	}
}
