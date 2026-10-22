import { describe, it, expect, vi, beforeEach } from 'vitest';
import { env } from '$env/dynamic/private';

const captureCheckIn = vi.fn<(...args: unknown[]) => string>(() => 'check-in-1');
const captureException = vi.fn();
vi.mock('@sentry/sveltekit', () => ({ captureCheckIn, captureException }));

let triggersResult: { data: unknown[] | null; error: { message: string } | null };
const executeAgent = vi.fn();
vi.mock('$lib/server/agent-executor.js', () => ({ executeAgent }));
vi.mock('$lib/server/supabase.js', () => {
	const query = {
		select: () => query,
		eq: () => query,
		update: () => query,
		then: (resolve: (v: unknown) => void) => resolve(triggersResult)
	};
	return {
		supabaseAdmin: {
			rpc: async () => ({ error: null }),
			from: () => query
		}
	};
});

const { POST } = await import('./+server');

const trigger = {
	id: 't1',
	agent_id: 'a1',
	organization_id: 'o1',
	cron_expression: '* * * * *',
	trigger_prompt: 'go',
	notify_channel: 'in_app',
	last_run_at: null,
	org_agents: { id: 'a1', system_prompt: 's', is_active: true, tool_whitelist: null }
};

function call(auth = 'Bearer secret') {
	const request = new Request('http://x/api/cron/agent-triggers', {
		method: 'POST',
		headers: { authorization: auth }
	});
	return POST({ request } as Parameters<typeof POST>[0]);
}

function statuses() {
	return captureCheckIn.mock.calls.map((c) => (c[0] as { status: string }).status);
}

beforeEach(() => {
	env.CRON_SECRET = 'secret';
	triggersResult = { data: [], error: null };
	captureCheckIn.mockClear();
	captureException.mockClear();
	executeAgent.mockReset();
});

describe('agent-triggers cron check-ins', () => {
	it('does not check in for an unauthorized request', async () => {
		await expect(call('Bearer wrong')).rejects.toMatchObject({ status: 401 });
		expect(captureCheckIn).not.toHaveBeenCalled();
	});

	it('checks in ok for a run with nothing due', async () => {
		const res = await call();
		expect(await res.json()).toEqual({ checked: 0, executed: [] });
		expect(statuses()).toEqual(['in_progress', 'ok']);
	});

	it('fails the check-in when the triggers cannot be loaded', async () => {
		triggersResult = { data: null, error: { message: 'db down' } };
		await call();
		expect(statuses()).toEqual(['in_progress', 'error']);
	});

	it('reports a failed agent as its own error and keeps the check-in ok', async () => {
		triggersResult = { data: [trigger], error: null };
		executeAgent.mockRejectedValue(new Error('model refused'));
		const res = await call();
		expect(await res.json()).toEqual({
			checked: 1,
			executed: [{ triggerId: 't1', ok: false, error: 'model refused' }]
		});
		expect(statuses()).toEqual(['in_progress', 'ok']);
		expect(captureException).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				tags: { cron: 'agent-triggers', trigger_id: 't1', agent_id: 'a1' }
			})
		);
	});
});
