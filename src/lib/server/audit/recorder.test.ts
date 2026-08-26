import { describe, it, expect } from 'vitest';
import {
	buildAuditRows,
	serviceActor,
	type AuditActor,
	type AuditRequestContext
} from './recorder.js';

const ctx: AuditRequestContext = {
	route: '/orders/[id]',
	method: 'POST',
	ip: '203.0.113.7',
	userAgent: 'vitest',
	requestId: 'req_1',
	correlationId: '00000000-0000-0000-0000-0000000000c0'
};

const human: AuditActor = {
	id: 'u1',
	email: 'rep@brand.co',
	label: 'Ada Rep',
	kind: 'user'
};

const ok = { httpStatus: 200, durationMs: 12 };

describe('buildAuditRows', () => {
	it('stamps actor, request context and outcome onto every event', () => {
		const [row] = buildAuditRows(
			[{ eventName: 'order.created', subjectId: 'o1' }],
			human,
			ctx,
			ok,
			'org1',
			'Acme Reps'
		);

		expect(row).toMatchObject({
			actor_id: 'u1',
			actor_email: 'rep@brand.co',
			actor_kind: 'user',
			event_name: 'order.created',
			subject_id: 'o1',
			organization_id: 'org1',
			organization_name: 'Acme Reps',
			route: '/orders/[id]',
			correlation_id: ctx.correlationId,
			status: 'success',
			http_status: 200,
			duration_ms: 12
		});
	});

	it('defaults subject_type from the event catalog', () => {
		const [row] = buildAuditRows([{ eventName: 'order.created' }], human, ctx, ok, null);
		expect(row.subject_type).toBe('orders');
	});

	it('lets an event override the catalog subject type', () => {
		const [row] = buildAuditRows(
			[{ eventName: 'order.created', subjectType: 'draft_orders' }],
			human,
			ctx,
			ok,
			null
		);
		expect(row.subject_type).toBe('draft_orders');
	});

	it('marks events as failed when the request failed', () => {
		const [row] = buildAuditRows(
			[{ eventName: 'order.created' }],
			human,
			ctx,
			{ httpStatus: 500, durationMs: 3 },
			null
		);
		expect(row.status).toBe('failure');
		expect(row.http_status).toBe(500);
	});

	it('does not override an explicitly recorded outcome', () => {
		const [row] = buildAuditRows(
			[{ eventName: 'integration.sync_failed', status: 'failure', errorCode: 'oauth_expired' }],
			human,
			ctx,
			ok,
			null
		);
		expect(row.status).toBe('failure');
		expect(row.error_code).toBe('oauth_expired');
	});

	it('shares one correlation id across every event in a request', () => {
		const rows = buildAuditRows(
			[{ eventName: 'order.created' }, { eventName: 'email.sent' }],
			human,
			ctx,
			ok,
			null
		);
		expect(new Set(rows.map((r) => r.correlation_id)).size).toBe(1);
	});

	it('prefers a per-event organization over the request default', () => {
		const [row] = buildAuditRows(
			[{ eventName: 'connection.accepted', organizationId: 'org2' }],
			human,
			ctx,
			ok,
			'org1'
		);
		expect(row.organization_id).toBe('org2');
	});

	it('redacts secrets from metadata', () => {
		const [row] = buildAuditRows(
			[
				{
					eventName: 'integration.connected',
					metadata: { provider: 'gmail', access_token: 'ya29.secret', nested: { apiKey: 'k' } }
				}
			],
			human,
			ctx,
			ok,
			null
		);
		const meta = row.metadata as Record<string, unknown>;
		expect(meta.provider).toBe('gmail');
		expect(meta.access_token).toBe('[redacted]');
		expect((meta.nested as Record<string, unknown>).apiKey).toBe('[redacted]');
	});

	it('carries a service principal so machine runs are never actor-less', () => {
		const [row] = buildAuditRows(
			[{ eventName: 'assistant.action_executed' }],
			serviceActor('agent-executor'),
			ctx,
			ok,
			'org1'
		);
		// Mirrors the audit_log_actor_identified check constraint.
		expect(row.actor_kind).toBe('service');
		expect(row.actor_service).toBe('agent-executor');
		expect(row.actor_id ?? null).toBeNull();
	});

	it('records impersonation without losing the real human', () => {
		const [row] = buildAuditRows(
			[{ eventName: 'order.status_changed' }],
			{ ...human, kind: 'system_admin', onBehalfOf: 'u9' },
			ctx,
			ok,
			null
		);
		expect(row.actor_id).toBe('u1');
		expect(row.actor_kind).toBe('system_admin');
		expect(row.on_behalf_of).toBe('u9');
	});
});
