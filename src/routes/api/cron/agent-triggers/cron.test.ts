import { describe, it, expect } from 'vitest';
import { isDue } from './is-due.js';

describe('isDue', () => {
	// Every Monday at 9am UTC
	const mondayNine = '0 9 * * 1';

	it('is due when never run and the cron has ticked at least once', () => {
		const now = new Date('2026-04-20T09:01:00Z'); // Monday
		expect(isDue(mondayNine, null, now)).toBe(true);
	});

	it('is NOT due when the most recent firing already ran', () => {
		const now = new Date('2026-04-20T09:30:00Z'); // Monday
		const lastRun = new Date('2026-04-20T09:00:05Z').toISOString();
		expect(isDue(mondayNine, lastRun, now)).toBe(false);
	});

	it('is due again a week later', () => {
		const now = new Date('2026-04-27T09:00:05Z'); // Next Monday
		const lastRun = new Date('2026-04-20T09:00:05Z').toISOString();
		expect(isDue(mondayNine, lastRun, now)).toBe(true);
	});

	it('returns false for an invalid cron expression', () => {
		const now = new Date('2026-04-20T09:00:00Z');
		expect(isDue('not a cron', null, now)).toBe(false);
	});

	it('handles every-5-minutes expressions', () => {
		const now = new Date('2026-04-16T12:02:00Z');
		const lastRun = new Date('2026-04-16T11:55:00Z').toISOString();
		expect(isDue('*/5 * * * *', lastRun, now)).toBe(true);
	});
});
