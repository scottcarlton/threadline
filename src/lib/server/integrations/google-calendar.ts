import { google } from 'googleapis';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$env/static/private';
import { supabaseAdmin } from '../supabase.js';
import type { IntegrationConnection } from '$lib/types/database.js';

const SCOPES = [
	'https://www.googleapis.com/auth/calendar',
	'https://www.googleapis.com/auth/userinfo.email'
];

const REDIRECT_URI = '/api/integrations/google-calendar/callback';

function getOAuthClient(origin: string) {
	return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${origin}${REDIRECT_URI}`);
}

export function getAuthUrl(origin: string, state: string): string {
	const client = getOAuthClient(origin);
	return client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
		prompt: 'consent',
		state
	});
}

export async function exchangeCode(origin: string, code: string) {
	const client = getOAuthClient(origin);
	const { tokens } = await client.getToken(code);
	return tokens;
}

export async function getAccountEmail(origin: string, accessToken: string): Promise<string> {
	const client = getOAuthClient(origin);
	client.setCredentials({ access_token: accessToken });
	const oauth2 = google.oauth2({ version: 'v2', auth: client });
	const { data } = await oauth2.userinfo.get();
	return data.email ?? '';
}

async function getAuthenticatedClient(connection: IntegrationConnection, origin: string) {
	const client = getOAuthClient(origin);
	client.setCredentials({
		access_token: connection.access_token,
		refresh_token: connection.refresh_token,
		expiry_date: connection.token_expires_at
			? new Date(connection.token_expires_at).getTime()
			: undefined
	});

	client.on('tokens', async (tokens) => {
		const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (tokens.access_token) updateData.access_token = tokens.access_token;
		if (tokens.expiry_date)
			updateData.token_expires_at = new Date(tokens.expiry_date).toISOString();
		if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;

		await supabaseAdmin.from('integration_connections').update(updateData).eq('id', connection.id);
	});

	return client;
}

export async function getCalendarClient(organizationId: string, origin: string) {
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('*')
		.eq('organization_id', organizationId)
		.eq('provider', 'google_calendar')
		.eq('status', 'active')
		.single();

	if (!connection) return null;

	const auth = await getAuthenticatedClient(connection as IntegrationConnection, origin);
	return {
		calendar: google.calendar({ version: 'v3', auth }),
		connectionId: connection.id
	};
}

export type CalendarEventInput = {
	summary: string;
	description?: string;
	location?: string;
	startDate: string; // YYYY-MM-DD
	startTime?: string; // HH:MM (24-hour)
	endDate?: string; // YYYY-MM-DD
	endTime?: string; // HH:MM (24-hour)
	duration?: number; // minutes, defaults to 30 if startTime given and no endDate/endTime
};

export async function createCalendarEvent(
	organizationId: string,
	origin: string,
	event: CalendarEventInput
): Promise<string | null> {
	const client = await getCalendarClient(organizationId, origin);
	if (!client) return null;

	let start: { date: string } | { dateTime: string; timeZone: string };
	let end: { date: string } | { dateTime: string; timeZone: string };

	if (event.startTime) {
		// Timed event
		const startDateTime = `${event.startDate}T${event.startTime}:00`;

		let endDateTime: string;
		if (event.endDate && event.endTime) {
			endDateTime = `${event.endDate}T${event.endTime}:00`;
		} else if (event.endDate) {
			endDateTime = `${event.endDate}T${event.startTime}:00`;
		} else {
			// Default duration: 30 minutes
			const durationMinutes = event.duration ?? 30;
			const startMs = new Date(`${event.startDate}T${event.startTime}:00`).getTime();
			const endMs = startMs + durationMinutes * 60 * 1000;
			const endDate = new Date(endMs);
			const padded = (n: number) => String(n).padStart(2, '0');
			endDateTime = `${event.startDate}T${padded(endDate.getHours())}:${padded(endDate.getMinutes())}:00`;
		}

		start = { dateTime: startDateTime, timeZone: 'UTC' };
		end = { dateTime: endDateTime, timeZone: 'UTC' };
	} else {
		// All-day event
		const endDate = event.endDate ?? event.startDate;
		start = { date: event.startDate };
		end = { date: endDate };
	}

	const response = await client.calendar.events.insert({
		calendarId: 'primary',
		requestBody: {
			summary: event.summary,
			description: event.description,
			location: event.location,
			start,
			end
		}
	});

	return response.data.id ?? null;
}

export async function deleteCalendarEvent(
	organizationId: string,
	origin: string,
	eventId: string
): Promise<boolean> {
	const client = await getCalendarClient(organizationId, origin);
	if (!client) return false;

	await client.calendar.events.delete({
		calendarId: 'primary',
		eventId
	});

	return true;
}

export async function listCalendarEvents(
	organizationId: string,
	origin: string,
	timeMin: string,
	timeMax: string
) {
	const client = await getCalendarClient(organizationId, origin);
	if (!client) return null;

	const response = await client.calendar.events.list({
		calendarId: 'primary',
		timeMin,
		timeMax,
		singleEvents: true,
		orderBy: 'startTime'
	});

	return response.data.items ?? [];
}
