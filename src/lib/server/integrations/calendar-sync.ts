import {
	createCalendarEvent,
	deleteCalendarEvent,
	updateCalendarEvent,
	type CalendarEventInput
} from './google-calendar.js';
import {
	createMsCalendarEvent,
	deleteMsCalendarEvent,
	updateMsCalendarEvent
} from './microsoft/calendar-user.js';
import { supabaseAdmin } from '../supabase.js';
import { calendarAction } from './calendar-plan.js';

type ShowDateData = {
	id: string;
	start_date: string | null;
	end_date: string | null;
	venue: string | null;
	city: string | null;
	state: string | null;
	showName: string | null;
};

/** The appointment fields calendar sync needs, with its joins flattened. */
export type CalendarAppointment = {
	id: string;
	created_by: string | null;
	status: string | null;
	scheduled_date: string | null;
	scheduled_time: string | null;
	duration_minutes: number | null;
	notes: string | null;
	location_detail: string | null;
	google_calendar_event_id: string | null;
	ms_calendar_event_id: string | null;
	accountName: string | null;
	showName: string | null;
	showCity: string | null;
	showState: string | null;
};

type AppointmentRow = Omit<
	CalendarAppointment,
	'accountName' | 'showName' | 'showCity' | 'showState'
> & {
	freeform_account_name: string | null;
	accounts: { business_name?: string } | { business_name?: string }[] | null;
	show_dates: {
		city?: string | null;
		state?: string | null;
		shows?: { name?: string } | { name?: string }[] | null;
	} | null;
};

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Reads what calendar sync needs for one appointment. Admin read, keyed on
 * the appointment id and the caller's org, both derived on the server by the
 * route that just wrote the row.
 */
export async function loadCalendarAppointment(
	appointmentId: string,
	organizationId: string
): Promise<CalendarAppointment | null> {
	const { data } = await supabaseAdmin
		.from('appointments')
		.select(
			'id, created_by, status, scheduled_date, scheduled_time, duration_minutes, notes, location_detail, google_calendar_event_id, ms_calendar_event_id, freeform_account_name, accounts(business_name), show_dates(city, state, shows(name))'
		)
		.eq('id', appointmentId)
		.eq('organization_id', organizationId)
		.maybeSingle();
	if (!data) return null;
	const row = data as unknown as AppointmentRow;
	const show = one(row.show_dates);
	return {
		id: row.id,
		created_by: row.created_by,
		status: row.status,
		scheduled_date: row.scheduled_date,
		scheduled_time: row.scheduled_time,
		duration_minutes: row.duration_minutes,
		notes: row.notes,
		location_detail: row.location_detail,
		google_calendar_event_id: row.google_calendar_event_id,
		ms_calendar_event_id: row.ms_calendar_event_id,
		accountName: one(row.accounts)?.business_name ?? row.freeform_account_name ?? null,
		showName: one(show?.shows)?.name ?? null,
		showCity: show?.city ?? null,
		showState: show?.state ?? null
	};
}

export function appointmentEventInput(a: CalendarAppointment): CalendarEventInput | null {
	if (!a.scheduled_date) return null;
	return {
		summary: a.accountName ?? 'Appointment',
		description:
			[a.showName ? `Show: ${a.showName}` : null, a.notes].filter(Boolean).join('\n') || undefined,
		location: [a.location_detail, a.showCity, a.showState].filter(Boolean).join(', ') || undefined,
		startDate: a.scheduled_date,
		startTime: a.scheduled_time?.slice(0, 5) ?? undefined,
		duration: a.duration_minutes ?? 30
	};
}

/**
 * Brings an appointment's calendar events in line with the appointment,
 * after any create or edit (SCO-146). Fire-and-forget: calendar outages never
 * break appointment CRUD.
 *
 * Events live in the calendar of whoever created the appointment, so that
 * user's connection is used no matter who made the edit.
 */
export function reconcileAppointmentCalendar(
	appointmentId: string,
	organizationId: string,
	origin: string
): void {
	doSync(async () => {
		const appt = await loadCalendarAppointment(appointmentId, organizationId);
		if (!appt?.created_by) return;
		const owner = appt.created_by;
		const input = appointmentEventInput(appt);
		const wanted = input !== null && appt.status !== 'cancelled';

		await Promise.all([
			applyAction(
				calendarAction(appt.google_calendar_event_id, wanted),
				{
					create: () => createCalendarEvent(owner, origin, input!),
					update: (id) => updateCalendarEvent(owner, origin, id, input!),
					remove: (id) => deleteCalendarEvent(owner, origin, id)
				},
				(id) => setEventId(appt.id, 'google_calendar_event_id', id)
			),
			applyAction(
				calendarAction(appt.ms_calendar_event_id, wanted),
				{
					create: () => createMsCalendarEvent(owner, input!),
					update: (id) => updateMsCalendarEvent(owner, id, input!),
					remove: (id) => deleteMsCalendarEvent(owner, id)
				},
				(id) => setEventId(appt.id, 'ms_calendar_event_id', id)
			)
		]);
	});
}

/**
 * Removes a deleted appointment's events from its creator's calendars.
 * Pass the row as read before the delete. Fire-and-forget.
 */
export function removeAppointmentFromCalendars(
	origin: string,
	appt: {
		created_by: string | null;
		google_calendar_event_id: string | null;
		ms_calendar_event_id: string | null;
	}
): void {
	const owner = appt.created_by;
	if (!owner) return;
	if (appt.google_calendar_event_id) {
		const id = appt.google_calendar_event_id;
		doSync(() => deleteCalendarEvent(owner, origin, id));
	}
	if (appt.ms_calendar_event_id) {
		const id = appt.ms_calendar_event_id;
		doSync(() => deleteMsCalendarEvent(owner, id));
	}
}

async function applyAction(
	action: ReturnType<typeof calendarAction>,
	ops: {
		create: () => Promise<string | null>;
		update: (id: string) => Promise<boolean>;
		remove: (id: string) => Promise<boolean>;
	},
	save: (id: string | null) => Promise<void>
): Promise<void> {
	try {
		if (action.kind === 'create') {
			const id = await ops.create();
			if (id) await save(id);
		} else if (action.kind === 'update') {
			await ops.update(action.eventId);
		} else if (action.kind === 'remove') {
			await ops.remove(action.eventId);
			await save(null);
		}
	} catch (err) {
		console.error('[calendar-sync]', err instanceof Error ? err.message : err);
	}
}

async function setEventId(
	appointmentId: string,
	column: 'google_calendar_event_id' | 'ms_calendar_event_id',
	value: string | null
): Promise<void> {
	await supabaseAdmin
		.from('appointments')
		.update({ [column]: value })
		.eq('id', appointmentId);
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
	fn().catch((err) => {
		console.error('[calendar-sync]', err instanceof Error ? err.message : err);
	});
}
