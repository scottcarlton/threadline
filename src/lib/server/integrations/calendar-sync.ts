import { createCalendarEvent, deleteCalendarEvent } from './google-calendar.js';
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
 * Sync an appointment to Google Calendar. Fire-and-forget — never blocks
 * the caller and swallows errors so calendar outages don't break appointment CRUD.
 */
export function syncAppointmentToCalendar(
	organizationId: string,
	origin: string,
	appointment: AppointmentData
): void {
	if (!appointment.scheduled_date) return;
	const startDate = appointment.scheduled_date;

	doSync(async () => {
		const eventId = await createCalendarEvent(organizationId, origin, {
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
		});

		if (eventId) {
			await supabaseAdmin
				.from('appointments')
				.update({ google_calendar_event_id: eventId })
				.eq('id', appointment.id);
		}
	});
}

/**
 * Delete an appointment's Google Calendar event. Fire-and-forget.
 */
export function deleteAppointmentFromCalendar(
	organizationId: string,
	origin: string,
	googleCalendarEventId: string
): void {
	doSync(() => deleteCalendarEvent(organizationId, origin, googleCalendarEventId));
}

/**
 * Sync a show date to Google Calendar as an all-day event. Fire-and-forget.
 */
export function syncShowDateToCalendar(
	organizationId: string,
	origin: string,
	showDate: ShowDateData
): void {
	if (!showDate.start_date) return;

	doSync(async () => {
		const eventId = await createCalendarEvent(organizationId, origin, {
			summary: showDate.showName ?? 'Market',
			location:
				[showDate.venue, showDate.city, showDate.state].filter(Boolean).join(', ') || undefined,
			startDate: showDate.start_date!,
			endDate: showDate.end_date ?? undefined
		});

		if (eventId) {
			await supabaseAdmin
				.from('show_dates')
				.update({ google_calendar_event_id: eventId })
				.eq('id', showDate.id);
		}
	});
}

function doSync(fn: () => Promise<unknown>): void {
	fn().catch(() => {});
}
