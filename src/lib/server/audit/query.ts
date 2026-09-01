/**
 * Read side of the audit log, for the /system console.
 *
 * Reads go through `supabaseAdmin` because `audit_log` has no SELECT policy:
 * RLS denies `authenticated` outright, so the only way in is the service role.
 * That makes the caller responsible for authorisation — every function here
 * must be called behind a server-derived `locals.isSystemAdmin` check, never
 * behind a client-supplied flag.
 */
import { supabaseAdmin } from '$lib/server/supabase.js';
import { AUDIT_EVENTS, auditEventDef, type AuditEventName } from './events.js';

export type AuditLogRow = {
	id: string;
	created_at: string;
	actor_id: string | null;
	actor_email: string | null;
	actor_label: string | null;
	actor_kind: string;
	actor_service: string | null;
	on_behalf_of: string | null;
	event_name: string;
	subject_type: string | null;
	subject_id: string | null;
	subject_label: string | null;
	organization_id: string | null;
	organization_name: string | null;
	route: string | null;
	method: string | null;
	correlation_id: string | null;
	status: string;
	http_status: number | null;
	error_code: string | null;
	error_message: string | null;
	duration_ms: number | null;
	metadata: Record<string, unknown> | null;
	changes: Record<string, { before?: unknown; after?: unknown }> | null;
};

export type ActivityFilter = {
	organizationId?: string;
	actorId?: string;
	subjectType?: string;
	subjectId?: string;
	eventNames?: string[];
	/** 'failure' narrows to problems, which is the usual incident entry point. */
	status?: 'success' | 'failure';
	/**
	 * Drop rows whose actor is a system admin.
	 *
	 * Console reads are themselves audited, so an admin browsing /system fills
	 * the feed with their own `system.*` rows and buries the org activity the
	 * feed exists to surface. The rows stay written; this only hides them from
	 * the views that are asking "what are orgs and their users doing".
	 *
	 * Deliberately NOT applied on a system admin's own user detail page: that
	 * page is the audit-the-auditor view, and hiding them there would make the
	 * rows unreadable anywhere.
	 */
	excludeSystemActors?: boolean;
	/** Keyset pagination: return rows strictly older than this timestamp. */
	before?: string;
	limit?: number;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function fetchActivity(
	filter: ActivityFilter
): Promise<{ rows: AuditLogRow[]; hasMore: boolean }> {
	const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

	let query = supabaseAdmin
		.from('audit_log')
		.select('*')
		.order('created_at', { ascending: false })
		// Fetch one extra to detect a further page without a count query.
		.limit(limit + 1);

	if (filter.organizationId) query = query.eq('organization_id', filter.organizationId);
	if (filter.actorId) query = query.eq('actor_id', filter.actorId);
	if (filter.subjectType) query = query.eq('subject_type', filter.subjectType);
	if (filter.subjectId) query = query.eq('subject_id', filter.subjectId);
	if (filter.status) query = query.eq('status', filter.status);
	// `actor_kind` is NOT NULL and stamped by the auth hook, so a plain `neq`
	// is exact and cannot silently drop service or anonymous rows the way a
	// NOT IN over the nullable `actor_email` would.
	if (filter.excludeSystemActors) query = query.neq('actor_kind', 'system_admin');
	if (filter.eventNames?.length) query = query.in('event_name', filter.eventNames);
	if (filter.before) query = query.lt('created_at', filter.before);

	const { data, error } = await query;
	if (error) throw error;

	const rows = (data ?? []) as AuditLogRow[];
	return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

/**
 * Render one row as a sentence. Rendering happens here at read time rather than
 * being stored, so wording can change without rewriting history.
 */
export function describeAuditRow(row: AuditLogRow): string {
	const actor =
		row.actor_label ||
		row.actor_email ||
		row.actor_service ||
		(row.actor_kind === 'anonymous' ? 'An unauthenticated visitor' : 'Someone');

	const def = isKnownEvent(row.event_name) ? auditEventDef(row.event_name) : null;
	const action = def?.label ?? row.event_name.replace(/[._]/g, ' ');

	const subject = row.subject_label ? ` (${row.subject_label})` : '';
	const failed = row.status === 'failure' ? ', which failed' : '';

	return `${actor} ${action}${subject}${failed}`;
}

/**
 * Rows written by an older deploy may name an event the current catalog no
 * longer lists. Those must still render, so fall back to the raw name.
 */
function isKnownEvent(name: string): name is AuditEventName {
	return Object.prototype.hasOwnProperty.call(AUDIT_EVENTS, name);
}
