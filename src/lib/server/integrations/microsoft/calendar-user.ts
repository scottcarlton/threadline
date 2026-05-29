import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { supabaseAdmin } from '../../supabase.js';

const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'Calendars.ReadWrite'];
const REDIRECT_URI = '/api/integrations/microsoft-calendar/callback';
const AUTHORITY = 'https://login.microsoftonline.com/common';

export function getMsCalendarAuthUrl(origin: string, state: string): string {
	const params = new URLSearchParams({
		client_id: MICROSOFT_CLIENT_ID,
		response_type: 'code',
		redirect_uri: `${origin}${REDIRECT_URI}`,
		scope: SCOPES.join(' '),
		response_mode: 'query',
		state
	});
	return `${AUTHORITY}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMsCalendarCode(
	origin: string,
	code: string
): Promise<{
	accessToken: string;
	refreshToken: string;
	expiresAt: string;
	email: string;
}> {
	const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: MICROSOFT_CLIENT_ID,
			client_secret: MICROSOFT_CLIENT_SECRET,
			code,
			redirect_uri: `${origin}${REDIRECT_URI}`,
			grant_type: 'authorization_code',
			scope: SCOPES.join(' ')
		})
	});

	const data = await res.json();
	if (data.error) {
		throw new Error(`Microsoft OAuth error: ${data.error_description ?? data.error}`);
	}

	const profile = await fetch('https://graph.microsoft.com/v1.0/me', {
		headers: { Authorization: `Bearer ${data.access_token}` }
	}).then((r) => r.json());

	return {
		accessToken: data.access_token as string,
		refreshToken: (data.refresh_token ?? '') as string,
		expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
		email: (profile.mail ?? profile.userPrincipalName ?? '') as string
	};
}

export async function getMsCalendarToken(profileId: string): Promise<string | null> {
	const { data: connection } = await supabaseAdmin
		.from('email_connections')
		.select('*')
		.eq('profile_id', profileId)
		.eq('provider', 'microsoft_calendar')
		.single();

	if (!connection) return null;

	if (connection.token_expires_at) {
		const expiresAt = new Date(connection.token_expires_at).getTime();
		if (Date.now() > expiresAt - 5 * 60 * 1000) {
			return refreshMsCalendarToken(connection.id, connection.refresh_token);
		}
	}

	return connection.access_token;
}

async function refreshMsCalendarToken(
	connectionId: string,
	refreshToken: string | null
): Promise<string | null> {
	if (!refreshToken) return null;

	const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: MICROSOFT_CLIENT_ID,
			client_secret: MICROSOFT_CLIENT_SECRET,
			refresh_token: refreshToken,
			grant_type: 'refresh_token',
			scope: SCOPES.join(' ')
		})
	});

	const data = await res.json();
	if (data.error) return null;

	await supabaseAdmin
		.from('email_connections')
		.update({
			access_token: data.access_token,
			refresh_token: data.refresh_token ?? refreshToken,
			token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', connectionId);

	return data.access_token;
}

type MsCalendarEventInput = {
	summary: string;
	description?: string;
	location?: string;
	startDate: string;
	startTime?: string;
	endDate?: string;
	endTime?: string;
	duration?: number;
};

export async function createMsCalendarEvent(
	profileId: string,
	event: MsCalendarEventInput
): Promise<string | null> {
	const token = await getMsCalendarToken(profileId);
	if (!token) return null;

	const isAllDay = !event.startTime;

	let body: Record<string, unknown>;

	if (isAllDay) {
		const endDate = event.endDate ?? event.startDate;
		// Graph API all-day events: end date is exclusive (next day)
		const endPlusOne = new Date(endDate);
		endPlusOne.setDate(endPlusOne.getDate() + 1);
		const endStr = endPlusOne.toISOString().split('T')[0];

		body = {
			subject: event.summary,
			body: event.description ? { contentType: 'text', content: event.description } : undefined,
			location: event.location ? { displayName: event.location } : undefined,
			isAllDay: true,
			start: { dateTime: `${event.startDate}T00:00:00`, timeZone: 'UTC' },
			end: { dateTime: `${endStr}T00:00:00`, timeZone: 'UTC' }
		};
	} else {
		const startDateTime = `${event.startDate}T${event.startTime}:00`;
		const durationMinutes = event.duration ?? 30;

		let endDateTime: string;
		if (event.endDate && event.endTime) {
			endDateTime = `${event.endDate}T${event.endTime}:00`;
		} else {
			const endMs = new Date(startDateTime).getTime() + durationMinutes * 60 * 1000;
			endDateTime = new Date(endMs).toISOString().replace('Z', '');
		}

		body = {
			subject: event.summary,
			body: event.description ? { contentType: 'text', content: event.description } : undefined,
			location: event.location ? { displayName: event.location } : undefined,
			start: { dateTime: startDateTime, timeZone: 'UTC' },
			end: { dateTime: endDateTime, timeZone: 'UTC' }
		};
	}

	const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!res.ok) return null;
	const data = await res.json();
	return (data.id as string) ?? null;
}

export async function deleteMsCalendarEvent(profileId: string, eventId: string): Promise<boolean> {
	const token = await getMsCalendarToken(profileId);
	if (!token) return false;

	const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${token}` }
	});

	return res.ok;
}
