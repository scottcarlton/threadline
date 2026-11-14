/**
 * Google Calendar events shown read-only beside Threadline appointments
 * (SCO-146). Pure mapping, so the shape is testable without Google.
 */

export type ExternalEvent = {
	id: string;
	summary: string;
	/** YYYY-MM-DD, in the event's own time zone. */
	date: string;
	/** HH:MM, or null for an all-day event. */
	time: string | null;
	/** Link to the event in Google Calendar, when Google gives one. */
	url: string | null;
};

/** The parts of a Google Calendar event this reads. */
export type GoogleEventLike = {
	id?: string | null;
	status?: string | null;
	summary?: string | null;
	htmlLink?: string | null;
	start?: { date?: string | null; dateTime?: string | null } | null;
};

const DATE = /^(\d{4}-\d{2}-\d{2})$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/;

/**
 * Maps a Google event, or null when it should not show: cancelled, missing an
 * id or a start, or one of `ownEventIds` (a copy of a Threadline appointment
 * or show date, which the list already shows).
 *
 * A timed event keeps the wall-clock date and time Google reports in the
 * event's own offset, which is how the rep entered it.
 */
export function toExternalEvent(
	event: GoogleEventLike,
	ownEventIds: ReadonlySet<string>
): ExternalEvent | null {
	if (!event.id || event.status === 'cancelled' || ownEventIds.has(event.id)) return null;

	let date: string | null = null;
	let time: string | null = null;
	const timed = event.start?.dateTime?.match(DATE_TIME);
	const allDay = event.start?.date?.match(DATE);
	if (timed) {
		date = timed[1];
		time = timed[2];
	} else if (allDay) {
		date = allDay[1];
	}
	if (!date) return null;

	return {
		id: event.id,
		summary: event.summary?.trim() || 'Busy',
		date,
		time,
		url: event.htmlLink ?? null
	};
}
