import { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } from '$env/static/private';
import { supabaseAdmin } from '../supabase.js';

const SCOPES = ['incoming-webhook', 'chat:write', 'channels:read'];
const REDIRECT_URI = '/api/integrations/slack/callback';

export function getAuthUrl(origin: string, state: string): string {
	const params = new URLSearchParams({
		client_id: SLACK_CLIENT_ID,
		scope: SCOPES.join(','),
		redirect_uri: `${origin}${REDIRECT_URI}`,
		state
	});
	return `https://slack.com/oauth/v2/authorize?${params}`;
}

export async function exchangeCode(
	origin: string,
	code: string
): Promise<{
	accessToken: string;
	teamId: string;
	teamName: string;
	channelId: string;
	channelName: string;
	webhookUrl: string;
}> {
	const res = await fetch('https://slack.com/api/oauth.v2.access', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: SLACK_CLIENT_ID,
			client_secret: SLACK_CLIENT_SECRET,
			code,
			redirect_uri: `${origin}${REDIRECT_URI}`
		})
	});

	const data = await res.json();

	if (!data.ok) {
		throw new Error(`Slack OAuth error: ${data.error}`);
	}

	return {
		accessToken: data.access_token,
		teamId: data.team?.id ?? '',
		teamName: data.team?.name ?? '',
		channelId: data.incoming_webhook?.channel_id ?? '',
		channelName: data.incoming_webhook?.channel ?? '',
		webhookUrl: data.incoming_webhook?.url ?? ''
	};
}

export async function sendSlackMessage(
	organizationId: string,
	message: SlackMessage
): Promise<boolean> {
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('*')
		.eq('organization_id', organizationId)
		.eq('provider', 'slack')
		.eq('status', 'active')
		.single();

	if (!connection) return false;

	const config = connection.config as Record<string, unknown>;
	const webhookUrl = config.webhook_url as string;

	if (!webhookUrl) return false;

	const res = await fetch(webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(formatSlackPayload(message))
	});

	return res.ok;
}

export type SlackMessage = {
	title: string;
	text: string;
	url?: string;
	color?: string;
};

function formatSlackPayload(message: SlackMessage) {
	const attachment: Record<string, unknown> = {
		color: message.color ?? '#18181b',
		blocks: [
			{
				type: 'section',
				text: { type: 'mrkdwn', text: `*${message.title}*\n${message.text}` }
			}
		]
	};

	if (message.url) {
		attachment.blocks = [
			...(attachment.blocks as unknown[]),
			{
				type: 'actions',
				elements: [
					{
						type: 'button',
						text: { type: 'plain_text', text: 'View in Threadline' },
						url: message.url
					}
				]
			}
		];
	}

	return { attachments: [attachment] };
}
