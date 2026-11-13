import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ supabaseAdmin: {} }));
vi.mock('./google-calendar.js', () => ({}));
vi.mock('./microsoft/calendar-user.js', () => ({}));

const { appointmentEventInput } = await import('./calendar-sync');

const base = {
	id: 'a1',
	created_by: 'u1',
	status: 'scheduled',
	scheduled_date: '2026-11-20',
	scheduled_time: '14:30:00',
	duration_minutes: 45,
	notes: 'Bring the resort samples',
	location_detail: 'Booth 12',
	google_calendar_event_id: null,
	ms_calendar_event_id: null,
	accountName: 'Bloom & Co',
	showName: 'Atlanta Apparel',
	showCity: 'Atlanta',
	showState: 'GA'
};

describe('appointmentEventInput', () => {
	it('builds the event from the appointment', () => {
		expect(appointmentEventInput(base)).toEqual({
			summary: 'Bloom & Co',
			description: 'Show: Atlanta Apparel\nBring the resort samples',
			location: 'Booth 12, Atlanta, GA',
			startDate: '2026-11-20',
			startTime: '14:30',
			duration: 45
		});
	});

	it('trims the seconds Postgres returns on a time', () => {
		expect(appointmentEventInput(base)?.startTime).toBe('14:30');
	});

	it('is all-day without a time, and has no input without a date', () => {
		expect(appointmentEventInput({ ...base, scheduled_time: null })?.startTime).toBeUndefined();
		expect(appointmentEventInput({ ...base, scheduled_date: null })).toBeNull();
	});

	it('falls back to a plain summary and drops empty fields', () => {
		const input = appointmentEventInput({
			...base,
			accountName: null,
			showName: null,
			notes: null,
			location_detail: null,
			showCity: null,
			showState: null,
			duration_minutes: null
		});
		expect(input).toMatchObject({ summary: 'Appointment', duration: 30 });
		expect(input?.description).toBeUndefined();
		expect(input?.location).toBeUndefined();
	});
});
