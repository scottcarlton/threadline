import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } from '$env/static/private';
import { supabaseAdmin } from '../supabase.js';

const SCOPES = ['webhook.incoming', 'bot'];
const REDIRECT_URI = '/api/integrations/discord/callback';

export function getAuthUrl(origin: string, state: string): string {
	const params = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		redirect_uri: `${origin}${REDIRECT_URI}`,
		response_type: 'code',
		scope: SCOPES.join(' '),
		state
	});
	return `https://discord.com/oauth2/authorize?${params}`;
}

export async function exchangeCode(
	origin: string,
	code: string
): Promise<{
	accessToken: string;
	webhookId: string;
	webhookToken: string;
	webhookUrl: string;
	guildId: string;
	guildName: string;
	channelId: string;
}> {
	const res = await fetch('https://discord.com/api/v10/oauth2/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: DISCORD_CLIENT_ID,
			client_secret: DISCORD_CLIENT_SECRET,
			grant_type: 'authorization_code',
			code,
			redirect_uri: `${origin}${REDIRECT_URI}`
		})
	});

	const data = await res.json();

	if (data.error) {
		throw new Error(`Discord OAuth error: ${data.error}`);
	}

	const webhook = data.webhook;

	return {
		accessToken: data.access_token,
		webhookId: webhook?.id ?? '',
		webhookToken: webhook?.token ?? '',
		webhookUrl: webhook ? `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}` : '',
		guildId: data.guild?.id ?? '',
		guildName: data.guild?.name ?? '',
		channelId: webhook?.channel_id ?? ''
	};
}

export async function sendDiscordMessage(
	organizationId: string,
	message: DiscordMessage
): Promise<boolean> {
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('*')
		.eq('organization_id', organizationId)
		.eq('provider', 'discord')
		.eq('status', 'active')
		.single();

	if (!connection) return false;

	const config = connection.config as Record<string, unknown>;
	const webhookUrl = config.webhook_url as string;

	if (!webhookUrl) return false;

	const res = await fetch(webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(formatDiscordPayload(message))
	});

	return res.ok;
}

export type DiscordMessage = {
	title: string;
	text: string;
	url?: string;
	color?: string;
};

function hexToDecimal(hex: string): number {
	return parseInt(hex.replace('#', ''), 16);
}

function formatDiscordPayload(message: DiscordMessage) {
	const embed: Record<string, unknown> = {
		title: message.title,
		description: message.text,
		color: hexToDecimal(message.color ?? '#18181b')
	};

	if (message.url) {
		embed.url = message.url;
	}

	return {
		embeds: [embed]
	};
}
