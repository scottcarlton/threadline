import { createCalendarEvent, deleteCalendarEvent } from './google-calendar.js';
import { createMsCalendarEvent, deleteMsCalendarEvent } from './microsoft/calendar-user.js';
import { supabaseAdmin } from '../supabase.js';

type AppointmentData = {
	id: string;
	scheduled_date: string | null;
	scheduled_time: string | null;
	duration_minutes: number;
	notes: string | null;
	location_detail: string | null;
	accountName: string | null;
	showName: string | null;
	showCity: string | null;
	showState: string | null;
};

type ShowDateData = {
	id: string;
	start_date: string | null;
	end_date: string | null;
	venue: string | null;
	city: string | null;
	state: string | null;
	showName: string | null;
};

/**
 * Sync an appointment to all connected calendars. Fire-and-forget — never blocks
 * the caller and swallows errors so calendar outages don't break appointment CRUD.
 */
export function syncAppointmentToCalendar(
	userId: string,
	origin: string,
	appointment: AppointmentData
): void {
	if (!appointment.scheduled_date) return;
	const startDate = appointment.scheduled_date;

	const eventInput = {
		summary: appointment.accountName ?? 'Appointment',
		description:
			[appointment.showName ? `Show: ${appointment.showName}` : null, appointment.notes]
				.filter(Boolean)
				.join('\n') || undefined,
		location:
			[appointment.location_detail, appointment.showCity, appointment.showState]
				.filter(Boolean)
				.join(', ') || undefined,
		startDate,
		startTime: appointment.scheduled_time ?? undefined,
		duration: appointment.duration_minutes ?? 30
	};

	doSync(async () => {
		const eventId = await createCalendarEvent(userId, origin, eventInput);
		if (eventId) {
			await supabaseAdmin
				.from('appointments')
				.update({ google_calendar_event_id: eventId })
				.eq('id', appointment.id);
		}
	});

	doSync(async () => {
		const msEventId = await createMsCalendarEvent(userId, eventInput);
		if (msEventId) {
			await supabaseAdmin
				.from('appointments')
				.update({ ms_calendar_event_id: msEventId })
				.eq('id', appointment.id);
		}
	});
}

/**
 * Delete an appointment's Google Calendar event. Fire-and-forget.
 */
export function deleteAppointmentFromCalendar(
	userId: string,
	origin: string,
	googleCalendarEventId: string
): void {
	doSync(() => deleteCalendarEvent(userId, origin, googleCalendarEventId));
}

/**
 * Delete an appointment's Microsoft Calendar event. Fire-and-forget.
 */
export function deleteAppointmentFromMsCalendar(userId: string, msCalendarEventId: string): void {
	doSync(() => deleteMsCalendarEvent(userId, msCalendarEventId));
}

/**
 * Sync a show date to all connected calendars as an all-day event. Fire-and-forget.
 */
export function syncShowDateToCalendar(
	userId: string,
	origin: string,
	showDate: ShowDateData
): void {
	if (!showDate.start_date) return;

	const eventInput = {
		summary: showDate.showName ?? 'Market',
		location:
			[showDate.venue, showDate.city, showDate.state].filter(Boolean).join(', ') || undefined,
		startDate: showDate.start_date!,
		endDate: showDate.end_date ?? undefined
	};

	doSync(async () => {
		const eventId = await createCalendarEvent(userId, origin, eventInput);
		if (eventId) {
			await supabaseAdmin
				.from('show_dates')
				.update({ google_calendar_event_id: eventId })
				.eq('id', showDate.id);
		}
	});

	doSync(async () => {
		const msEventId = await createMsCalendarEvent(userId, eventInput);
		if (msEventId) {
			await supabaseAdmin
				.from('show_dates')
				.update({ ms_calendar_event_id: msEventId })
				.eq('id', showDate.id);
		}
	});
}

function doSync(fn: () => Promise<unknown>): void {
	fn().catch(() => {});
}
