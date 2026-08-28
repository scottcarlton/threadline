/**
 * The audit event catalog.
 *
 * This file is the single source of truth for what an audit event may be
 * called. Postgres only enforces the `resource.action` shape, so adding an
 * event here needs no migration — but an event NOT listed here will not
 * typecheck at the call site, which is the point: the taxonomy stays closed
 * and the /system timeline stays renderable.
 *
 * `label` is the human phrasing shown in the console. Rendering happens at
 * read time from structured columns, so labels can be reworded freely without
 * rewriting history.
 */

export type AuditCategory =
	| 'auth'
	| 'organization'
	| 'membership'
	| 'connection'
	| 'commerce'
	| 'catalog'
	| 'integration'
	| 'assistant'
	| 'messaging'
	| 'system';

type EventDef = {
	category: AuditCategory;
	/** Human phrasing, written to read after an actor name: "Scott created an order". */
	label: string;
	/** Default subject table for events that reference one. */
	subjectType?: string;
};

export const AUDIT_EVENTS = {
	// ── Auth ────────────────────────────────────────────────────────────────
	'auth.signed_in': { category: 'auth', label: 'signed in' },
	'auth.sign_in_failed': { category: 'auth', label: 'failed to sign in' },
	'auth.signed_out': { category: 'auth', label: 'signed out' },
	'auth.invite_accepted': { category: 'auth', label: 'accepted an invitation' },

	// ── Organization ────────────────────────────────────────────────────────
	'organization.created': {
		category: 'organization',
		label: 'created the organization',
		subjectType: 'organizations'
	},
	'organization.updated': {
		category: 'organization',
		label: 'updated organization details',
		subjectType: 'organizations'
	},
	'organization.settings_changed': {
		category: 'organization',
		label: 'changed organization settings',
		subjectType: 'organizations'
	},
	'organization.onboarding_completed': {
		category: 'organization',
		label: 'completed onboarding',
		subjectType: 'organizations'
	},

	// ── Membership ──────────────────────────────────────────────────────────
	'member.invited': { category: 'membership', label: 'invited a member', subjectType: 'profiles' },
	'member.added': { category: 'membership', label: 'added a member', subjectType: 'profiles' },
	'member.removed': { category: 'membership', label: 'removed a member', subjectType: 'profiles' },
	'member.role_changed': {
		category: 'membership',
		label: "changed a member's role",
		subjectType: 'profiles'
	},
	'member.brand_access_changed': {
		category: 'membership',
		label: "changed a member's brand access",
		subjectType: 'profiles'
	},

	// ── Federation / connections ────────────────────────────────────────────
	'connection.requested': {
		category: 'connection',
		label: 'requested a connection',
		subjectType: 'org_connections'
	},
	'connection.accepted': {
		category: 'connection',
		label: 'accepted a connection',
		subjectType: 'org_connections'
	},
	'connection.declined': {
		category: 'connection',
		label: 'declined a connection',
		subjectType: 'org_connections'
	},
	'connection.revoked': {
		category: 'connection',
		label: 'revoked a connection',
		subjectType: 'org_connections'
	},

	// ── Commerce ────────────────────────────────────────────────────────────
	'order.created': { category: 'commerce', label: 'created an order', subjectType: 'orders' },
	'order.updated': { category: 'commerce', label: 'updated an order', subjectType: 'orders' },
	'order.status_changed': {
		category: 'commerce',
		label: 'changed an order status',
		subjectType: 'orders'
	},
	'order.submitted': { category: 'commerce', label: 'submitted an order', subjectType: 'orders' },
	'order.cancelled': { category: 'commerce', label: 'cancelled an order', subjectType: 'orders' },
	'order.lines_changed': {
		category: 'commerce',
		label: 'edited order lines',
		subjectType: 'orders'
	},
	'account.created': { category: 'commerce', label: 'created an account', subjectType: 'accounts' },
	'account.updated': { category: 'commerce', label: 'updated an account', subjectType: 'accounts' },
	'expense.submitted': {
		category: 'commerce',
		label: 'submitted an expense',
		subjectType: 'brand_expenses'
	},
	'expense.reviewed': {
		category: 'commerce',
		label: 'reviewed an expense',
		subjectType: 'brand_expenses'
	},
	'appointment.created': {
		category: 'commerce',
		label: 'created an appointment',
		subjectType: 'appointments'
	},
	'appointment.cancelled': {
		category: 'commerce',
		label: 'cancelled an appointment',
		subjectType: 'appointments'
	},

	// ── Catalog ─────────────────────────────────────────────────────────────
	'product.created': { category: 'catalog', label: 'created a product', subjectType: 'products' },
	'product.updated': { category: 'catalog', label: 'updated a product', subjectType: 'products' },
	'product.deleted': { category: 'catalog', label: 'deleted a product', subjectType: 'products' },
	'product.imported': { category: 'catalog', label: 'imported products' },

	// ── Integrations ────────────────────────────────────────────────────────
	'integration.connected': { category: 'integration', label: 'connected an integration' },
	'integration.disconnected': { category: 'integration', label: 'disconnected an integration' },
	'integration.sync_failed': { category: 'integration', label: 'had an integration sync fail' },

	// ── Assistant (Stitch) ──────────────────────────────────────────────────
	'assistant.queried': { category: 'assistant', label: 'asked Stitch a question' },
	'assistant.action_executed': { category: 'assistant', label: 'ran a Stitch action' },
	'assistant.rate_limited': { category: 'assistant', label: 'was rate limited by Stitch' },

	// ── Messaging ───────────────────────────────────────────────────────────
	'email.sent': { category: 'messaging', label: 'sent an email' },
	'email.intake_processed': { category: 'messaging', label: 'processed an inbound email' },
	'message.sent': { category: 'messaging', label: 'sent a message' },

	// ── System console (auditing the auditor) ───────────────────────────────
	'system.org_viewed': {
		category: 'system',
		label: "opened an organization's record",
		subjectType: 'organizations'
	},
	'system.user_viewed': {
		category: 'system',
		label: "opened a user's record",
		subjectType: 'profiles'
	},
	'system.activity_viewed': { category: 'system', label: 'viewed an activity trail' },
	'system.impersonation_started': {
		category: 'system',
		label: 'started acting as another user',
		subjectType: 'profiles'
	},
	'system.impersonation_ended': {
		category: 'system',
		label: 'stopped acting as another user',
		subjectType: 'profiles'
	},
	'system.flag_changed': { category: 'system', label: 'changed a feature flag' },
	'system.invite_sent': { category: 'system', label: 'sent a beta invite' }
} as const satisfies Record<string, EventDef>;

export type AuditEventName = keyof typeof AUDIT_EVENTS;

export function auditEventDef(name: AuditEventName): EventDef {
	return AUDIT_EVENTS[name];
}

/** All event names, for building filter UI in the /system console. */
export const AUDIT_EVENT_NAMES = Object.keys(AUDIT_EVENTS) as AuditEventName[];
