import { CronExpressionParser } from 'cron-parser';

// A trigger is "due" when the cron's most recent scheduled firing
// (relative to now) is more recent than its last actual run. Starting
// from never-run (last_run_at = null) fires on the next cron tick.
export function isDue(cronExpression: string, lastRunAt: string | null, now: Date): boolean {
	try {
		const prevScheduled = CronExpressionParser.parse(cronExpression, { currentDate: now })
			.prev()
			.toDate();
		const lastRun = lastRunAt ? new Date(lastRunAt) : new Date(0);
		return prevScheduled.getTime() > lastRun.getTime();
	} catch (err) {
		console.error(`Invalid cron expression "${cronExpression}":`, err);
		return false;
	}
}
