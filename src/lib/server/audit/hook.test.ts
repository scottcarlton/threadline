import { describe, it, expect, vi, beforeEach } from 'vitest';

const inserted: unknown[][] = [];
const insert = vi.fn(async (rows: unknown[]): Promise<{ error: Error | null }> => {
	inserted.push(rows);
	return { error: null };
});
const captureException = vi.fn();

vi.mock('$lib/server/supabase.js', () => ({
	supabaseAdmin: { from: () => ({ insert }) }
}));
vi.mock('@sentry/sveltekit', () => ({ captureException }));
// Run deferred work inline so assertions do not race the flush.
vi.mock('./defer.js', () => ({ defer: async (work: () => Promise<void>) => work() }));

const { auditHandle } = await import('./hook.js');

type Locals = { audit: import('./recorder.js').AuditRecorder };

function makeEvent(method = 'POST') {
	return {
		locals: {} as Locals,
		route: { id: '/api/orders/[id]/status' },
		request: { method, headers: new Headers({ 'user-agent': 'vitest' }) },
		getClientAddress: () => '203.0.113.7'
	};
}

beforeEach(() => {
	inserted.length = 0;
	insert.mockClear();
	captureException.mockClear();
});

describe('auditHandle', () => {
	it('writes nothing when a handler records nothing', async () => {
		const event = makeEvent('GET');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await auditHandle({ event, resolve: async () => new Response('ok') } as any);
		expect(insert).not.toHaveBeenCalled();
	});

	it('flushes what a handler recorded, stamped with the response status', async () => {
		const event = makeEvent();
		await auditHandle({
			event,
			resolve: async () => {
				event.locals.audit.setActor({
					id: 'u1',
					email: 'rep@brand.co',
					label: 'Ada Rep',
					kind: 'user'
				});
				event.locals.audit.setOrganization('org1', 'Acme Reps');
				event.locals.audit.record('order.status_changed', { subjectLabel: 'SO-1042' });
				return new Response('ok', { status: 200 });
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(inserted).toHaveLength(1);
		const [row] = inserted[0] as Record<string, unknown>[];
		expect(row.event_name).toBe('order.status_changed');
		expect(row.actor_label).toBe('Ada Rep');
		expect(row.organization_name).toBe('Acme Reps');
		expect(row.route).toBe('/api/orders/[id]/status');
		expect(row.ip).toBe('203.0.113.7');
		expect(row.http_status).toBe(200);
		expect(row.status).toBe('success');
		expect(typeof row.duration_ms).toBe('number');
	});

	it('still flushes when the handler throws a redirect, and records its status', async () => {
		const event = makeEvent();
		const redirect = { status: 303, location: '/login' };

		await expect(
			auditHandle({
				event,
				resolve: async () => {
					event.locals.audit.setActor({ id: 'u1', email: null, label: null, kind: 'user' });
					event.locals.audit.record('auth.signed_out');
					throw redirect;
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)
		).rejects.toBe(redirect);

		const [row] = inserted[0] as Record<string, unknown>[];
		expect(row.http_status).toBe(303);
		// A redirect is not a failure.
		expect(row.status).toBe('success');
	});

	it('marks recorded events as failures when the request 500s', async () => {
		const event = makeEvent();
		await expect(
			auditHandle({
				event,
				resolve: async () => {
					event.locals.audit.setActor({ id: 'u1', email: null, label: null, kind: 'user' });
					event.locals.audit.record('order.created');
					throw new Error('boom');
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)
		).rejects.toThrow('boom');

		const [row] = inserted[0] as Record<string, unknown>[];
		expect(row.http_status).toBe(500);
		expect(row.status).toBe('failure');
	});

	it('reports a failed audit write to Sentry instead of breaking the request', async () => {
		insert.mockImplementationOnce(async () => ({ error: new Error('db down') }));
		const event = makeEvent();

		const response = await auditHandle({
			event,
			resolve: async () => {
				event.locals.audit.setActor({ id: 'u1', email: null, label: null, kind: 'user' });
				event.locals.audit.record('order.created');
				return new Response('ok', { status: 200 });
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(response.status).toBe(200);
		expect(captureException).toHaveBeenCalledOnce();
	});

	it('gives every event from one request the same correlation id', async () => {
		const event = makeEvent();
		await auditHandle({
			event,
			resolve: async () => {
				event.locals.audit.setActor({ id: 'u1', email: null, label: null, kind: 'user' });
				event.locals.audit.record('order.created');
				event.locals.audit.record('email.sent');
				return new Response('ok');
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		const rows = inserted[0] as Record<string, unknown>[];
		expect(rows).toHaveLength(2);
		expect(rows[0].correlation_id).toBe(rows[1].correlation_id);
	});
});
