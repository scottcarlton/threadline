/**
 * What to do with one calendar's copy of an appointment (SCO-146).
 *
 * `wanted` is whether the appointment should be on the calendar at all: it
 * has a date and isn't cancelled. `eventId` is the event already there, if any.
 */
export type CalendarAction =
	| { kind: 'create' }
	| { kind: 'update'; eventId: string }
	| { kind: 'remove'; eventId: string }
	| { kind: 'none' };

export function calendarAction(eventId: string | null, wanted: boolean): CalendarAction {
	if (wanted) return eventId ? { kind: 'update', eventId } : { kind: 'create' };
	return eventId ? { kind: 'remove', eventId } : { kind: 'none' };
}
