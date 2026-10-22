import * as Sentry from '@sentry/sveltekit';

// Sentry Crons monitor for this endpoint. The schedule must match vercel.json
// (a test holds them together). Sentry creates or updates the monitor from
// this config on each check-in, so there is nothing to set up by hand.
type MonitorConfig = NonNullable<Parameters<typeof Sentry.captureCheckIn>[1]>;

export const MONITOR_SLUG = 'agent-triggers';

export const MONITOR_CONFIG = {
	schedule: { type: 'crontab', value: '*/5 * * * *' },
	// Vercel can start a cron a minute or two late.
	checkinMargin: 2,
	maxRuntime: 5,
	// One missed or failed run is noise; two in a row is ten minutes of
	// scheduled agents not running.
	failureIssueThreshold: 2,
	recoveryThreshold: 1,
	timezone: 'Etc/UTC'
} satisfies MonitorConfig;

/**
 * Wrap one cron run in Sentry check-ins. `run` returns whether the run did
 * its job; false (or a throw) reports the run as failed. A missing check-in
 * means the cron never fired at all, which Sentry reports as missed.
 */
export async function withCronMonitor<T>(
	run: () => Promise<{ ok: boolean; result: T }>
): Promise<T> {
	const checkInId = Sentry.captureCheckIn(
		{ monitorSlug: MONITOR_SLUG, status: 'in_progress' },
		MONITOR_CONFIG
	);
	const started = performance.now();
	const finish = (status: 'ok' | 'error') =>
		Sentry.captureCheckIn({
			checkInId,
			monitorSlug: MONITOR_SLUG,
			status,
			duration: (performance.now() - started) / 1000
		});

	try {
		const { ok, result } = await run();
		finish(ok ? 'ok' : 'error');
		return result;
	} catch (err) {
		finish('error');
		throw err;
	}
}
