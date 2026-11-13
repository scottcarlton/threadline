/**
 * Start and end for a Google Calendar event, from the date and time fields
 * Threadline stores (SCO-146). Times are wall-clock and sent as UTC, which is
 * how appointments have always been pushed.
 */

export type EventTimesInput = {
	startDate: string; // YYYY-MM-DD
	startTime?: string; // HH:MM (24-hour)
	endDate?: string; // YYYY-MM-DD
	endTime?: string; // HH:MM (24-hour)
	duration?: number; // minutes, used when only a start time is known
};

export type GoogleEventTime = { date: string } | { dateTime: string; timeZone: string };

const pad = (n: number) => String(n).padStart(2, '0');

/** Adds minutes to a wall-clock date and time, rolling over midnight. */
export function addMinutes(date: string, time: string, minutes: number): string {
	const [y, mo, d] = date.split('-').map(Number);
	const [h, mi] = time.split(':').map(Number);
	const t = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes));
	return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00`;
}

export function googleEventTimes(event: EventTimesInput): {
	start: GoogleEventTime;
	end: GoogleEventTime;
} {
	if (!event.startTime) {
		return {
			start: { date: event.startDate },
			end: { date: event.endDate ?? event.startDate }
		};
	}

	const start = `${event.startDate}T${event.startTime}:00`;
	let end: string;
	if (event.endDate && event.endTime) end = `${event.endDate}T${event.endTime}:00`;
	else if (event.endDate) end = `${event.endDate}T${event.startTime}:00`;
	else end = addMinutes(event.startDate, event.startTime, event.duration ?? 30);

	return {
		start: { dateTime: start, timeZone: 'UTC' },
		end: { dateTime: end, timeZone: 'UTC' }
	};
}
