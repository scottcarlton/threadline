import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { supabaseAdmin } from '../../supabase.js';

const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'Mail.Read', 'Mail.Send'];
const REDIRECT_URI = '/api/email-outlook/callback';
const AUTHORITY = 'https://login.microsoftonline.com/common';

export function getOutlookAuthUrl(origin: string, state: string): string {
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

export async function exchangeOutlookCode(
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

export async function getOutlookUserToken(profileId: string): Promise<string | null> {
	const { data: connection } = await supabaseAdmin
		.from('email_connections')
		.select('*')
		.eq('profile_id', profileId)
		.eq('provider', 'outlook')
		.single();

	if (!connection) return null;

	// Check token expiry (5 min buffer)
	if (connection.token_expires_at) {
		const expiresAt = new Date(connection.token_expires_at).getTime();
		if (Date.now() > expiresAt - 5 * 60 * 1000) {
			return refreshOutlookToken(connection.id, connection.refresh_token);
		}
	}

	return connection.access_token;
}

async function refreshOutlookToken(
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

	const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

	await supabaseAdmin
		.from('email_connections')
		.update({
			access_token: data.access_token,
			refresh_token: data.refresh_token ?? refreshToken,
			token_expires_at: expiresAt,
			updated_at: new Date().toISOString()
		})
		.eq('id', connectionId);

	return data.access_token;
}
