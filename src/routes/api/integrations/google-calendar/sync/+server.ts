import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCalendarEvent } from '$lib/server/integrations/google-calendar';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const orgId = locals.organization?.id;

	if (!orgId) {
		return json({ error: 'No active organization' }, { status: 400 });
	}

	const body = (await request.json()) as { type: 'appointments' | 'shows'; ids: string[] };

	if (!body.type || !body.ids?.length) {
		return json({ error: 'Missing type or ids' }, { status: 400 });
	}

	let synced = 0;
	let errors = 0;

	if (body.type === 'appointments') {
		const { data: appointments } = await supabaseAdmin
			.from('appointments')
			.select(
				'id, scheduled_date, scheduled_time, duration_minutes, notes, location_detail, accounts(business_name), show_dates(shows(name), city, state)'
			)
			.eq('organization_id', orgId)
			.in('id', body.ids);

		for (const appt of appointments ?? []) {
			const a = appt as Record<string, unknown>;
			const account = a.accounts as Record<string, unknown> | null;
			const showDate = a.show_dates as Record<string, unknown> | null;
			const show = showDate?.shows as Record<string, unknown> | null;

			try {
				await createCalendarEvent(userId, url.origin, {
					summary: `${account?.business_name ?? 'Appointment'}`,
					description: [show?.name ? `Show: ${show.name}` : null, a.notes as string | null]
						.filter(Boolean)
						.join('\n'),
					location:
						[
							a.location_detail as string | null,
							showDate?.city as string | null,
							showDate?.state as string | null
						]
							.filter(Boolean)
							.join(', ') || undefined,
					startDate: a.scheduled_date as string,
					startTime: a.scheduled_time as string | undefined,
					duration: (a.duration_minutes as number) ?? 30
				});
				synced++;
			} catch {
				errors++;
			}
		}
	}

	if (body.type === 'shows') {
		const { data: shows } = await supabaseAdmin
			.from('show_dates')
			.select('id, start_date, end_date, city, state, venue, shows(name)')
			.eq('organization_id', orgId)
			.in('id', body.ids);

		for (const sd of shows ?? []) {
			const s = sd as Record<string, unknown>;
			const show = s.shows as Record<string, unknown> | null;

			try {
				await createCalendarEvent(userId, url.origin, {
					summary: (show?.name as string) ?? 'Market',
					location: [s.venue, s.city, s.state].filter(Boolean).join(', ') || undefined,
					startDate: s.start_date as string,
					endDate: s.end_date as string
				});
				synced++;
			} catch {
				errors++;
			}
		}
	}

	return json({ synced, errors });
};
