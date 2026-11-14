import { describe, expect, it } from 'vitest';
import { toExternalEvent } from './external-events';

const none = new Set<string>();

describe('toExternalEvent', () => {
	it('maps a timed event using its own wall-clock time', () => {
		expect(
			toExternalEvent(
				{
					id: 'g1',
					summary: 'Lunch with Dana',
					htmlLink: 'https://calendar.google.com/event?eid=g1',
					start: { dateTime: '2026-11-20T12:30:00-05:00' }
				},
				none
			)
		).toEqual({
			id: 'g1',
			summary: 'Lunch with Dana',
			date: '2026-11-20',
			time: '12:30',
			url: 'https://calendar.google.com/event?eid=g1'
		});
	});

	it('maps an all-day event with no time', () => {
		expect(
			toExternalEvent({ id: 'g2', summary: 'Out', start: { date: '2026-11-21' } }, none)
		).toMatchObject({ date: '2026-11-21', time: null, url: null });
	});

	it('leaves out copies of Threadline appointments and show dates', () => {
		expect(
			toExternalEvent({ id: 'mine', start: { date: '2026-11-21' } }, new Set(['mine']))
		).toBeNull();
	});

	it('leaves out cancelled events and events without an id or start', () => {
		expect(
			toExternalEvent({ id: 'g3', status: 'cancelled', start: { date: '2026-11-21' } }, none)
		).toBeNull();
		expect(toExternalEvent({ start: { date: '2026-11-21' } }, none)).toBeNull();
		expect(toExternalEvent({ id: 'g4', start: {} }, none)).toBeNull();
		expect(toExternalEvent({ id: 'g5', start: { dateTime: 'not a date' } }, none)).toBeNull();
	});

	it('names an untitled event Busy', () => {
		expect(
			toExternalEvent({ id: 'g6', summary: '  ', start: { date: '2026-11-21' } }, none)?.summary
		).toBe('Busy');
	});
});
