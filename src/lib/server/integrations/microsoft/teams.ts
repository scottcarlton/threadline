import { graphFetch } from './oauth.js';
import { supabaseAdmin } from '../../supabase.js';

export type TeamsChannel = {
	id: string;
	displayName: string;
	teamId: string;
	teamName: string;
};

export async function listTeamsAndChannels(organizationId: string): Promise<TeamsChannel[]> {
	type TeamRef = { id: string; displayName: string };
	type ChannelRef = { id: string; displayName: string };
	const teams = await graphFetch<{ value: TeamRef[] }>(
		organizationId,
		'/me/joinedTeams?$select=id,displayName'
	);
	if (!teams?.value) return [];

	const channels: TeamsChannel[] = [];

	for (const team of teams.value) {
		const channelData = await graphFetch<{ value: ChannelRef[] }>(
			organizationId,
			`/teams/${team.id}/channels?$select=id,displayName`
		);

		if (channelData?.value) {
			for (const ch of channelData.value) {
				channels.push({
					id: ch.id,
					displayName: ch.displayName,
					teamId: team.id,
					teamName: team.displayName
				});
			}
		}
	}

	return channels;
}

export async function sendTeamsMessage(
	organizationId: string,
	message: { title: string; text: string; url?: string }
): Promise<boolean> {
	const { data: connection } = await supabaseAdmin
		.from('integration_connections')
		.select('config')
		.eq('organization_id', organizationId)
		.eq('provider', 'microsoft')
		.eq('status', 'active')
		.single();

	if (!connection) return false;

	const config = connection.config as Record<string, unknown>;
	const teamId = config.teams_team_id as string;
	const channelId = config.teams_channel_id as string;

	if (!teamId || !channelId) return false;

	let bodyContent = `<strong>${message.title}</strong><br>${message.text}`;
	if (message.url) {
		bodyContent += `<br><a href="${message.url}">View in Threadline</a>`;
	}

	try {
		await graphFetch(organizationId, `/teams/${teamId}/channels/${channelId}/messages`, {
			method: 'POST',
			body: JSON.stringify({
				body: { contentType: 'html', content: bodyContent }
			})
		});
		return true;
	} catch {
		return false;
	}
}
