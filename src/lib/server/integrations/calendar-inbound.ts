import { listCalendarEvents } from './google-calendar.js';
import { supabaseAdmin } from '../supabase.js';
import { toExternalEvent, type ExternalEvent } from '$lib/utils/external-events.js';

export const EXTERNAL_WINDOW_DAYS = 30;

/**
 * The signed-in user's own Google Calendar events for the next
 * EXTERNAL_WINDOW_DAYS days, to show read-only on /appointments (SCO-146).
 *
 * Only ever the viewer's calendar, read with their own connection. Events
 * that are copies of the org's Threadline appointments or show dates are left
 * out. Never throws: no connection, a revoked token or a Google outage all
 * come back as an empty list, so the page renders regardless.
 */
export async function loadExternalCalendarEvents(
	profileId: string,
	organizationId: string,
	origin: string,
	now = new Date()
): Promise<ExternalEvent[]> {
	try {
		const until = new Date(now.getTime() + EXTERNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
		const items = await listCalendarEvents(
			profileId,
			origin,
			now.toISOString(),
			until.toISOString()
		);
		if (!items || items.length === 0) return [];

		const ids = items.map((e) => e.id).filter((id): id is string => !!id);
		// Admin reads keyed on the viewer's org and on ids that came from the
		// viewer's own calendar; they only decide which events to hide.
		const [appts, shows] = await Promise.all([
			supabaseAdmin
				.from('appointments')
				.select('google_calendar_event_id')
				.eq('organization_id', organizationId)
				.in('google_calendar_event_id', ids),
			supabaseAdmin
				.from('show_dates')
				.select('google_calendar_event_id')
				.eq('organization_id', organizationId)
				.in('google_calendar_event_id', ids)
		]);
		const own = new Set(
			[...(appts.data ?? []), ...(shows.data ?? [])]
				.map((r: { google_calendar_event_id: string | null }) => r.google_calendar_event_id)
				.filter((id): id is string => !!id)
		);

		return items.map((e) => toExternalEvent(e, own)).filter((e): e is ExternalEvent => e !== null);
	} catch (err) {
		console.error('[calendar-inbound]', err instanceof Error ? err.message : err);
		return [];
	}
}
