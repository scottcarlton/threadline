import { describe, expect, it } from 'vitest';
import { addMinutes, googleEventTimes } from './calendar-event-times';

describe('addMinutes', () => {
	it('adds within the day', () => {
		expect(addMinutes('2026-11-13', '10:00', 45)).toBe('2026-11-13T10:45:00');
	});

	it('rolls past midnight into the next day', () => {
		expect(addMinutes('2026-11-13', '23:30', 60)).toBe('2026-11-14T00:30:00');
	});

	it('rolls over a month end', () => {
		expect(addMinutes('2026-12-31', '23:45', 30)).toBe('2027-01-01T00:15:00');
	});
});

describe('googleEventTimes', () => {
	it('makes an all-day event without a start time', () => {
		expect(googleEventTimes({ startDate: '2026-11-13' })).toEqual({
			start: { date: '2026-11-13' },
			end: { date: '2026-11-13' }
		});
	});

	it('keeps a multi-day all-day range', () => {
		expect(googleEventTimes({ startDate: '2026-11-13', endDate: '2026-11-15' }).end).toEqual({
			date: '2026-11-15'
		});
	});

	it('defaults a timed event to 30 minutes', () => {
		expect(googleEventTimes({ startDate: '2026-11-13', startTime: '14:00' })).toEqual({
			start: { dateTime: '2026-11-13T14:00:00', timeZone: 'UTC' },
			end: { dateTime: '2026-11-13T14:30:00', timeZone: 'UTC' }
		});
	});

	it('uses the duration', () => {
		expect(
			googleEventTimes({ startDate: '2026-11-13', startTime: '09:15', duration: 90 }).end
		).toEqual({ dateTime: '2026-11-13T10:45:00', timeZone: 'UTC' });
	});

	it('ends after midnight instead of before the start', () => {
		expect(
			googleEventTimes({ startDate: '2026-11-13', startTime: '23:30', duration: 60 }).end
		).toEqual({ dateTime: '2026-11-14T00:30:00', timeZone: 'UTC' });
	});

	it('prefers an explicit end', () => {
		expect(
			googleEventTimes({
				startDate: '2026-11-13',
				startTime: '09:00',
				endDate: '2026-11-13',
				endTime: '11:00',
				duration: 15
			}).end
		).toEqual({ dateTime: '2026-11-13T11:00:00', timeZone: 'UTC' });
	});
});
