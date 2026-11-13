import { describe, expect, it } from 'vitest';
import { calendarAction } from './calendar-plan';

describe('calendarAction', () => {
	it('creates an event the calendar lacks', () => {
		expect(calendarAction(null, true)).toEqual({ kind: 'create' });
	});

	it('updates an event that is already there', () => {
		expect(calendarAction('evt-1', true)).toEqual({ kind: 'update', eventId: 'evt-1' });
	});

	it('removes the event once the appointment is cancelled or undated', () => {
		expect(calendarAction('evt-1', false)).toEqual({ kind: 'remove', eventId: 'evt-1' });
	});

	it('does nothing when there is no event and none is wanted', () => {
		expect(calendarAction(null, false)).toEqual({ kind: 'none' });
	});
});
