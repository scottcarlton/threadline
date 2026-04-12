import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { supabaseAdmin } from '../../supabase.js';
import type { IntegrationConnection } from '$lib/types/database.js';

const SCOPES = [
	'openid',
	'profile',
	'email',
	'offline_access',
	'Mail.Read',
	'Mail.Send',
	'ChannelMessage.Send',
	'Files.ReadWrite'
];

const REDIRECT_URI = '/api/integrations/microsoft/callback';
const AUTHORITY = 'https://login.microsoftonline.com/common';

export function getAuthUrl(origin: string, state: string): string {
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

export async function exchangeCode(
	origin: string,
	code: string
): Promise<{
	accessToken: string;
	refreshToken: string;
	expiresAt: string;
	email: string;
	displayName: string;
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

	const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

	// Get user profile
	const profile = await fetch('https://graph.microsoft.com/v1.0/me', {
		headers: { Authorization: `Bearer ${data.access_token}` }
	}).then((r) => r.json());

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? '',
		expiresAt,
		email: profile.mail ?? profile.userPrincipalName ?? '',
		displayName: profile.displayName ?? ''
	};
}

export async function refreshAccessToken(connection: IntegrationConnection): Promise<string> {
	if (!connection.refresh_token) {
		throw new Error('No refresh token available');
	}

	const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: MICROSOFT_CLIENT_ID,
			client_secret: MICROSOFT_CLIENT_SECRET,
			refresh_token: connection.refresh_token,
			grant_type: 'refresh_token',
			scope: SCOPES.join(' ')
		})
	});

	const data = await res.json();

	if (data.error) {
		// Mark connection as errored
		await supabaseAdmin
			.from('integration_connections')
			.update({ status: 'error', updated_at: new Date().toISOString() })
			.eq('id', connection.id);
		throw new Error(`Token refresh failed: ${data.error_description ?? data.error}`);
	}

	const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

	await supabaseAdmin
		.from('integration_connections')
		.update({
			access_token: data.access_token,
			refresh_token: data.refresh_token ?? connection.refresh_token,
			token_expires_at: expiresAt,
			updated_at: new Date().toISOString()
		})
		.eq('id', connection.id);

	return data.access_token;
}

export async function getGraphToken(organizationId: string): Promise<string | null> {
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('*')
		.eq('organization_id', organizationId)
		.eq('provider', 'microsoft')
		.eq('status', 'active')
		.single();

	if (!connection) return null;

	const conn = connection as IntegrationConnection;

	// Check if token is expired or about to expire (5 min buffer)
	if (conn.token_expires_at) {
		const expiresAt = new Date(conn.token_expires_at).getTime();
		if (Date.now() > expiresAt - 5 * 60 * 1000) {
			return refreshAccessToken(conn);
		}
	}

	return conn.access_token;
}

// Generic Graph API helper
export async function graphFetch(
	organizationId: string,
	path: string,
	options?: RequestInit
): Promise<any> {
	const token = await getGraphToken(organizationId);
	if (!token) return null;

	const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...options?.headers
		}
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(`Graph API error: ${err.error?.message ?? res.statusText}`);
	}

	return res.json();
}
