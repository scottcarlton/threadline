import { describe, it, expect } from 'vitest';
import { describeAuditRow, type AuditLogRow } from './query.js';

function row(over: Partial<AuditLogRow> = {}): AuditLogRow {
	return {
		id: '1',
		created_at: '2026-08-19T00:00:00Z',
		actor_id: 'u1',
		actor_email: 'rep@brand.co',
		actor_label: 'Ada Rep',
		actor_kind: 'user',
		actor_service: null,
		on_behalf_of: null,
		event_name: 'order.created',
		subject_type: 'orders',
		subject_id: 'o1',
		subject_label: null,
		organization_id: null,
		organization_name: null,
		route: null,
		method: null,
		correlation_id: null,
		status: 'success',
		http_status: 200,
		error_code: null,
		error_message: null,
		duration_ms: 5,
		metadata: null,
		changes: null,
		...over
	};
}

describe('describeAuditRow', () => {
	it('reads as a sentence', () => {
		expect(describeAuditRow(row())).toBe('Ada Rep created an order');
	});

	it('names the subject when one is labelled', () => {
		expect(describeAuditRow(row({ subject_label: 'SO-1042' }))).toBe(
			'Ada Rep created an order (SO-1042)'
		);
	});

	it('calls out failures', () => {
		expect(describeAuditRow(row({ status: 'failure' }))).toBe(
			'Ada Rep created an order, which failed'
		);
	});

	it('falls back to email, then service, then a placeholder', () => {
		expect(describeAuditRow(row({ actor_label: null }))).toContain('rep@brand.co');
		expect(
			describeAuditRow(
				row({
					actor_label: null,
					actor_email: null,
					actor_kind: 'service',
					actor_service: 'agent-executor'
				})
			)
		).toContain('agent-executor');
		expect(describeAuditRow(row({ actor_label: null, actor_email: null }))).toContain('Someone');
	});

	it('names an unauthenticated visitor rather than "Someone"', () => {
		const text = describeAuditRow(
			row({
				actor_label: null,
				actor_email: null,
				actor_kind: 'anonymous',
				event_name: 'auth.sign_in_failed'
			})
		);
		expect(text).toBe('An unauthenticated visitor failed to sign in');
	});

	it('still renders an event the current catalog no longer knows', () => {
		expect(describeAuditRow(row({ event_name: 'legacy.thing_happened' }))).toBe(
			'Ada Rep legacy thing happened'
		);
	});
});
