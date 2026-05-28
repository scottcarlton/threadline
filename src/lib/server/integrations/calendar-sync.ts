import { supabaseAdmin } from '../supabase.js';
import { createMsCalendarEvent, deleteMsCalendarEvent } from './microsoft/calendar-user.js';

// Fire-and-forget wrapper — calendar sync failures never block the main flow
function doSync(fn: () => Promise<void>): void {
	fn().catch((err) => {
		console.error('[calendar-sync]', err);
	});
}

type AppointmentSyncInput = {
	id: string;
	accountName?: string | null;
	location_detail?: string | null;
	scheduled_date?: string | null;
	scheduled_time?: string | null;
	duration_minutes?: number | null;
	notes?: string | null;
};

export function syncAppointmentToCalendar(userId: string, appointment: AppointmentSyncInput): void {
	if (!appointment.scheduled_date) return;

	const startDate = appointment.scheduled_date;

	doSync(async () => {
		const msEventId = await createMsCalendarEvent(userId, {
			summary: appointment.accountName ?? 'Appointment',
			description: appointment.notes ?? undefined,
			location: appointment.location_detail ?? undefined,
			startDate,
			startTime: appointment.scheduled_time ?? undefined,
			duration: appointment.duration_minutes ?? 30
		});

		if (msEventId) {
			await supabaseAdmin
				.from('appointments')
				.update({ ms_calendar_event_id: msEventId })
				.eq('id', appointment.id);
		}
	});
}

export function deleteAppointmentFromMsCalendar(userId: string, msCalendarEventId: string): void {
	doSync(async () => {
		await deleteMsCalendarEvent(userId, msCalendarEventId);
	});
}

type ShowDateSyncInput = {
	id: string;
	showName?: string | null;
	location?: string | null;
	start_date?: string | null;
	end_date?: string | null;
};

export function syncShowDateToCalendar(userId: string, showDate: ShowDateSyncInput): void {
	if (!showDate.start_date) return;

	doSync(async () => {
		const msEventId = await createMsCalendarEvent(userId, {
			summary: showDate.showName ?? 'Market',
			location: showDate.location ?? undefined,
			startDate: showDate.start_date!,
			endDate: showDate.end_date ?? undefined
		});

		if (msEventId) {
			await supabaseAdmin
				.from('show_dates')
				.update({ ms_calendar_event_id: msEventId })
				.eq('id', showDate.id);
		}
	});
}
