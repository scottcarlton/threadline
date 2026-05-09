import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { executeAgent } from '$lib/server/agent-executor.js';
import { isDue } from './is-due.js';

// Vercel invokes this endpoint on the schedule in vercel.json.
// We fan out to any org_agent_triggers whose cron_expression is due.

type ScheduleTrigger = {
	id: string;
	agent_id: string;
	organization_id: string;
	cron_expression: string;
	trigger_prompt: string;
	notify_channel: string;
	last_run_at: string | null;
	org_agents:
		| { id: string; system_prompt: string; is_active: boolean; tool_whitelist: string[] | null }
		| Array<{
				id: string;
				system_prompt: string;
				is_active: boolean;
				tool_whitelist: string[] | null;
		  }>
		| null;
};

export const POST: RequestHandler = async ({ request }) => {
	const cronSecret = env.CRON_SECRET;
	const authHeader = request.headers.get('authorization') ?? '';
	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		throw error(401, 'Unauthorized');
	}

	const now = new Date();

	const { data: triggers } = await supabaseAdmin
		.from('org_agent_triggers')
		.select(
			'id, agent_id, organization_id, cron_expression, trigger_prompt, notify_channel, last_run_at, org_agents!inner(id, system_prompt, is_active, tool_whitelist)'
		)
		.eq('trigger_type', 'schedule')
		.eq('is_active', true);

	const rows = (triggers ?? []) as unknown as ScheduleTrigger[];
	const executed: Array<{ triggerId: string; ok: boolean; error?: string }> = [];

	for (const trigger of rows) {
		if (!trigger.cron_expression) continue;
		if (!isDue(trigger.cron_expression, trigger.last_run_at, now)) continue;

		const joined = trigger.org_agents;
		const agent = Array.isArray(joined) ? joined[0] : joined;
		if (!agent?.is_active) continue;

		try {
			await executeAgent({
				agentId: agent.id,
				orgId: trigger.organization_id,
				prompt: trigger.trigger_prompt,
				systemPrompt: agent.system_prompt,
				triggeredBy: 'schedule',
				triggerId: trigger.id,
				toolWhitelist: agent.tool_whitelist
			});

			await supabaseAdmin
				.from('org_agent_triggers')
				.update({ last_run_at: now.toISOString() })
				.eq('id', trigger.id);

			executed.push({ triggerId: trigger.id, ok: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			console.error(`Scheduled trigger ${trigger.id} failed:`, message);
			executed.push({ triggerId: trigger.id, ok: false, error: message });
		}
	}

	return json({ checked: rows.length, executed });
};

// Vercel Cron can also send GET; handle both for flexibility.
export const GET: RequestHandler = async (event) => {
	return POST(event);
};
