import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Records the filter calls `fetchActivity` makes so the tests can assert on the
 * query it built rather than on rows a real database would have to supply.
 */
const calls: Array<[string, ...unknown[]]> = [];
const builder: Record<string, unknown> = {};
for (const method of ['select', 'order', 'limit', 'eq', 'neq', 'in', 'lt']) {
	builder[method] = vi.fn((...args: unknown[]) => {
		calls.push([method, ...args]);
		return builder;
	});
}
// Awaiting the builder resolves like a PostgREST response.
builder.then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
	resolve({ data: [], error: null });

vi.mock('$lib/server/supabase.js', () => ({
	supabaseAdmin: { from: () => builder }
}));

import { describeAuditRow, fetchActivity, type AuditLogRow } from './query.js';

function filterCalls(method: string) {
	return calls.filter((c) => c[0] === method).map((c) => c.slice(1));
}

beforeEach(() => {
	calls.length = 0;
});

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

describe('fetchActivity excludeSystemActors', () => {
	it('drops system-admin actors when asked', async () => {
		await fetchActivity({ excludeSystemActors: true });
		expect(filterCalls('neq')).toContainEqual(['actor_kind', 'system_admin']);
	});

	it('leaves every actor in place by default', async () => {
		await fetchActivity({});
		expect(filterCalls('neq')).toHaveLength(0);
	});

	it('filters on actor_kind, not the nullable actor_email', async () => {
		// A NOT IN over actor_email would also drop service and anonymous rows,
		// whose actor_email is NULL. Those are exactly the rows an incident needs.
		await fetchActivity({ excludeSystemActors: true });
		const columns = [...filterCalls('neq'), ...filterCalls('in')].map((c) => c[0]);
		expect(columns).not.toContain('actor_email');
	});

	it('composes with the other filters rather than replacing them', async () => {
		await fetchActivity({ organizationId: 'org-1', status: 'failure', excludeSystemActors: true });
		expect(filterCalls('eq')).toContainEqual(['organization_id', 'org-1']);
		expect(filterCalls('eq')).toContainEqual(['status', 'failure']);
		expect(filterCalls('neq')).toContainEqual(['actor_kind', 'system_admin']);
	});
});
