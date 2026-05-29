import { CALENDLY_CLIENT_ID, CALENDLY_CLIENT_SECRET } from '$env/static/private';
import { supabaseAdmin } from '../supabase.js';

const REDIRECT_URI = '/api/integrations/calendly/callback';
const AUTH_BASE = 'https://auth.calendly.com';
const API_BASE = 'https://api.calendly.com';

export function getCalendlyAuthUrl(origin: string, state: string): string {
	const params = new URLSearchParams({
		client_id: CALENDLY_CLIENT_ID,
		response_type: 'code',
		redirect_uri: `${origin}${REDIRECT_URI}`,
		state
	});
	return `${AUTH_BASE}/oauth/authorize?${params}`;
}

export async function exchangeCalendlyCode(
	origin: string,
	code: string
): Promise<{
	accessToken: string;
	refreshToken: string;
	expiresAt: string;
	email: string;
	schedulingUrl: string;
	userUri: string;
}> {
	const res = await fetch(`${AUTH_BASE}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: CALENDLY_CLIENT_ID,
			client_secret: CALENDLY_CLIENT_SECRET,
			code,
			redirect_uri: `${origin}${REDIRECT_URI}`,
			grant_type: 'authorization_code'
		})
	});

	const data = await res.json();
	if (data.error) {
		throw new Error(`Calendly OAuth error: ${data.error_description ?? data.error}`);
	}

	const profile = await fetch(`${API_BASE}/users/me`, {
		headers: { Authorization: `Bearer ${data.access_token}` }
	}).then((r) => r.json());

	const resource = profile.resource ?? {};

	return {
		accessToken: data.access_token as string,
		refreshToken: (data.refresh_token ?? '') as string,
		expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
		email: (resource.email ?? '') as string,
		schedulingUrl: (resource.scheduling_url ?? '') as string,
		userUri: (resource.uri ?? '') as string
	};
}

export async function getCalendlyToken(profileId: string): Promise<string | null> {
	const { data: connection } = await supabaseAdmin
		.from('email_connections')
		.select('*')
		.eq('profile_id', profileId)
		.eq('provider', 'calendly')
		.single();

	if (!connection) return null;

	if (connection.token_expires_at) {
		const expiresAt = new Date(connection.token_expires_at).getTime();
		if (Date.now() > expiresAt - 5 * 60 * 1000) {
			return refreshCalendlyToken(connection.id, connection.refresh_token);
		}
	}

	return connection.access_token;
}

async function refreshCalendlyToken(
	connectionId: string,
	refreshToken: string | null
): Promise<string | null> {
	if (!refreshToken) return null;

	const res = await fetch(`${AUTH_BASE}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: CALENDLY_CLIENT_ID,
			client_secret: CALENDLY_CLIENT_SECRET,
			refresh_token: refreshToken,
			grant_type: 'refresh_token'
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

export async function getCalendlySchedulingUrl(profileId: string): Promise<string | null> {
	const { data: connection } = await supabaseAdmin
		.from('email_connections')
		.select('scheduling_url')
		.eq('profile_id', profileId)
		.eq('provider', 'calendly')
		.single();

	return (connection?.scheduling_url as string) ?? null;
}

export async function listCalendlyEventTypes(
	profileId: string
): Promise<Array<{ uri: string; name: string; slug: string; schedulingUrl: string }> | null> {
	const token = await getCalendlyToken(profileId);
	if (!token) return null;

	const { data: connection } = await supabaseAdmin
		.from('email_connections')
		.select('calendly_user_uri')
		.eq('profile_id', profileId)
		.eq('provider', 'calendly')
		.single();

	const userUri = (connection?.calendly_user_uri as string) ?? null;
	if (!userUri) return null;

	const res = await fetch(
		`${API_BASE}/event_types?user=${encodeURIComponent(userUri)}&active=true`,
		{ headers: { Authorization: `Bearer ${token}` } }
	);

	if (!res.ok) return null;
	const data = await res.json();

	return (data.collection ?? []).map(
		(et: { uri: string; name: string; slug: string; scheduling_url: string }) => ({
			uri: et.uri,
			name: et.name,
			slug: et.slug,
			schedulingUrl: et.scheduling_url
		})
	);
}

export async function listCalendlyScheduledEvents(
	profileId: string,
	minStartTime?: string,
	maxStartTime?: string
): Promise<Array<{
	uri: string;
	name: string;
	status: string;
	startTime: string;
	endTime: string;
	location: string | null;
}> | null> {
	const token = await getCalendlyToken(profileId);
	if (!token) return null;

	const { data: connection } = await supabaseAdmin
		.from('email_connections')
		.select('calendly_user_uri')
		.eq('profile_id', profileId)
		.eq('provider', 'calendly')
		.single();

	const userUri = (connection?.calendly_user_uri as string) ?? null;
	if (!userUri) return null;

	const params = new URLSearchParams({ user: userUri, status: 'active' });
	if (minStartTime) params.set('min_start_time', minStartTime);
	if (maxStartTime) params.set('max_start_time', maxStartTime);

	const res = await fetch(`${API_BASE}/scheduled_events?${params}`, {
		headers: { Authorization: `Bearer ${token}` }
	});

	if (!res.ok) return null;
	const data = await res.json();

	return (data.collection ?? []).map(
		(ev: {
			uri: string;
			name: string;
			status: string;
			start_time: string;
			end_time: string;
			location?: { location?: string };
		}) => ({
			uri: ev.uri,
			name: ev.name,
			status: ev.status,
			startTime: ev.start_time,
			endTime: ev.end_time,
			location: ev.location?.location ?? null
		})
	);
}
