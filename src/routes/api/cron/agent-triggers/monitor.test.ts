import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const captureCheckIn = vi.fn<(...args: unknown[]) => string>(() => 'check-in-1');
vi.mock('@sentry/sveltekit', () => ({ captureCheckIn }));

const { withCronMonitor, MONITOR_SLUG, MONITOR_CONFIG } = await import('./monitor');

beforeEach(() => captureCheckIn.mockClear());

function statuses() {
	return captureCheckIn.mock.calls.map((c) => (c[0] as { status: string }).status);
}

describe('withCronMonitor', () => {
	it('opens a check-in with the monitor config and closes it ok', async () => {
		const result = await withCronMonitor(async () => ({ ok: true, result: 'done' }));
		expect(result).toBe('done');
		expect(statuses()).toEqual(['in_progress', 'ok']);
		expect(captureCheckIn.mock.calls[0]).toEqual([
			{ monitorSlug: MONITOR_SLUG, status: 'in_progress' },
			MONITOR_CONFIG
		]);
		expect(captureCheckIn.mock.calls[1][0]).toMatchObject({
			checkInId: 'check-in-1',
			monitorSlug: MONITOR_SLUG
		});
	});

	it('closes the check-in as an error when the run reports failure', async () => {
		const result = await withCronMonitor(async () => ({ ok: false, result: 'partial' }));
		expect(result).toBe('partial');
		expect(statuses()).toEqual(['in_progress', 'error']);
	});

	it('closes the check-in as an error and rethrows when the run throws', async () => {
		await expect(
			withCronMonitor(async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(statuses()).toEqual(['in_progress', 'error']);
	});

	// Sentry flags a missed run against this schedule, so it has to be the one
	// Vercel actually runs.
	it('uses the schedule from vercel.json', () => {
		const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
			crons: Array<{ path: string; schedule: string }>;
		};
		const cron = vercel.crons.find((c) => c.path === '/api/cron/agent-triggers');
		expect(cron?.schedule).toBe(MONITOR_CONFIG.schedule.value);
	});
});
