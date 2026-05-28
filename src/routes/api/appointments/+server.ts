import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import {
	syncAppointmentToCalendar,
	deleteAppointmentFromCalendar
} from '$lib/server/integrations/calendar-sync.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, organization, membership } = locals;

	if (!session || !organization || !membership) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const {
		show_date_id,
		account_id,
		appointment_type,
		location_type,
		location_detail,
		scheduled_date,
		scheduled_time,
		duration_minutes,
		notes,
		freeform_account_name,
		freeform_contact_name,
		freeform_contact_email,
		freeform_contact_phone
	} = body;

	if (!account_id && !freeform_account_name) {
		return json({ error: 'Account or freeform account name is required' }, { status: 400 });
	}

	// Create the appointment
	const { data: appointment, error: apptError } = await locals.supabase
		.from('appointments')
		.insert({
			organization_id: organization.id,
			show_date_id: show_date_id || null,
			account_id: account_id || null,
			appointment_type: appointment_type || 'scheduled',
			location_type: location_type || 'show',
			location_detail: location_detail || null,
			scheduled_date: scheduled_date || null,
			scheduled_time: scheduled_time || null,
			duration_minutes: duration_minutes ?? 30,
			notes: notes || null,
			freeform_account_name: freeform_account_name || null,
			freeform_contact_name: freeform_contact_name || null,
			freeform_contact_email: freeform_contact_email || null,
			freeform_contact_phone: freeform_contact_phone || null,
			status: 'scheduled',
			created_by: session.user.id
		})
		.select()
		.single();

	if (apptError) {
		return json({ error: apptError.message }, { status: 500 });
	}

	// Auto-sync to Google Calendar (fire-and-forget)
	if (appointment) {
		const accountName = account_id
			? await supabaseAdmin
					.from('accounts')
					.select('business_name')
					.eq('id', account_id)
					.single()
					.then((r) => (r.data as { business_name: string } | null)?.business_name ?? null)
			: (freeform_account_name as string | null);

		let showName: string | null = null;
		let showCity: string | null = null;
		let showState: string | null = null;
		if (show_date_id) {
			const { data: sd } = await supabaseAdmin
				.from('show_dates')
				.select('city, state, shows(name)')
				.eq('id', show_date_id)
				.single();
			if (sd) {
				const sdTyped = sd as unknown as {
					city: string | null;
					state: string | null;
					shows: { name: string } | { name: string }[] | null;
				};
				const show = Array.isArray(sdTyped.shows) ? sdTyped.shows[0] : sdTyped.shows;
				showName = show?.name ?? null;
				showCity = sdTyped.city;
				showState = sdTyped.state;
			}
		}

		syncAppointmentToCalendar(session.user.id, request.url, {
			id: appointment.id,
			scheduled_date: scheduled_date ?? null,
			scheduled_time: scheduled_time ?? null,
			duration_minutes: duration_minutes ?? 30,
			notes: notes ?? null,
			location_detail: location_detail ?? null,
			accountName,
			showName,
			showCity,
			showState
		});
	}

	// Auto-create show_visit record if linked to a show and a real account
	if (show_date_id && account_id) {
		const { data: existingVisit } = await supabaseAdmin
			.from('show_visits')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('show_date_id', show_date_id)
			.eq('account_id', account_id)
			.maybeSingle();

		if (!existingVisit) {
			await supabaseAdmin.from('show_visits').insert({
				organization_id: organization.id,
				show_date_id,
				account_id,
				status: 'scheduled',
				is_new_account: false,
				created_by: session.user.id
			});
		}
	}

	return json({ appointment });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { session, organization } = locals;

	if (!session || !organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { id, ...updates } = body;

	if (!id) {
		return json({ error: 'Missing appointment ID' }, { status: 400 });
	}

	// Only allow updating specific fields
	const allowedFields: Record<string, unknown> = {};
	if ('status' in updates) allowedFields.status = updates.status;
	if ('notes' in updates) allowedFields.notes = updates.notes;
	if ('scheduled_date' in updates) allowedFields.scheduled_date = updates.scheduled_date;
	if ('scheduled_time' in updates) allowedFields.scheduled_time = updates.scheduled_time;
	if ('duration_minutes' in updates) allowedFields.duration_minutes = updates.duration_minutes;

	allowedFields.updated_at = new Date().toISOString();

	const { data: appointment, error: updateError } = await locals.supabase
		.from('appointments')
		.update(allowedFields)
		.eq('id', id)
		.eq('organization_id', organization.id)
		.select()
		.single();

	if (updateError) {
		return json({ error: updateError.message }, { status: 500 });
	}

	return json({ appointment });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const { session, organization } = locals;

	if (!session || !organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { id } = body;

	if (!id) {
		return json({ error: 'Missing appointment ID' }, { status: 400 });
	}

	// Check for Google Calendar event to delete
	const { data: existing } = await locals.supabase
		.from('appointments')
		.select('google_calendar_event_id')
		.eq('id', id)
		.eq('organization_id', organization.id)
		.single();

	const { error: deleteError } = await locals.supabase
		.from('appointments')
		.delete()
		.eq('id', id)
		.eq('organization_id', organization.id);

	if (deleteError) {
		return json({ error: deleteError.message }, { status: 500 });
	}

	if (existing?.google_calendar_event_id) {
		deleteAppointmentFromCalendar(session.user.id, request.url, existing.google_calendar_event_id);
	}

	return json({ success: true });
};
