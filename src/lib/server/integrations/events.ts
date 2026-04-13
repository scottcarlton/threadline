import { sendSlackMessage, type SlackMessage } from './slack.js';
import { sendDiscordMessage } from './discord.js';
import { sendTeamsMessage } from './microsoft/teams.js';
import { supabaseAdmin } from '../supabase.js';
import { executeAgent } from '../agent-executor.js';

export type IntegrationEvent =
	| 'order_submitted'
	| 'order_confirmed'
	| 'order_shipped'
	| 'order_cancelled'
	| 'new_account';

type EventPayload = {
	order_submitted: {
		orderNumber: string;
		accountName: string;
		brandName: string;
		total: number;
		url: string;
	};
	order_confirmed: { orderNumber: string; accountName: string; url: string };
	order_shipped: { orderNumber: string; accountName: string; url: string };
	order_cancelled: { orderNumber: string; accountName: string; reason?: string; url: string };
	new_account: { accountName: string; city?: string; state?: string; url: string };
};

const EVENT_FORMATTERS: Record<IntegrationEvent, (payload: any) => SlackMessage> = {
	order_submitted: (p: EventPayload['order_submitted']) => ({
		title: 'New Order Submitted',
		text: `*${p.orderNumber}* for ${p.accountName} (${p.brandName}) — $${p.total.toLocaleString()}`,
		url: p.url,
		color: '#16a34a'
	}),
	order_confirmed: (p: EventPayload['order_confirmed']) => ({
		title: 'Order Confirmed',
		text: `*${p.orderNumber}* for ${p.accountName} has been confirmed`,
		url: p.url,
		color: '#2563eb'
	}),
	order_shipped: (p: EventPayload['order_shipped']) => ({
		title: 'Order Shipped',
		text: `*${p.orderNumber}* for ${p.accountName} has shipped`,
		url: p.url,
		color: '#7c3aed'
	}),
	order_cancelled: (p: EventPayload['order_cancelled']) => ({
		title: 'Order Cancelled',
		text: `*${p.orderNumber}* for ${p.accountName} was cancelled${p.reason ? `: ${p.reason}` : ''}`,
		url: p.url,
		color: '#dc2626'
	}),
	new_account: (p: EventPayload['new_account']) => ({
		title: 'New Account Created',
		text: `*${p.accountName}*${p.city ? ` — ${p.city}, ${p.state}` : ''}`,
		url: p.url,
		color: '#18181b'
	})
};

export async function emitIntegrationEvent<E extends IntegrationEvent>(
	organizationId: string,
	event: E,
	payload: EventPayload[E]
): Promise<void> {
	const formatter = EVENT_FORMATTERS[event];
	if (!formatter) return;

	const message = formatter(payload);

	// Send to all notification integrations in parallel
	await Promise.allSettled([
		sendSlackMessage(organizationId, message),
		sendDiscordMessage(organizationId, {
			title: message.title,
			text: message.text,
			url: message.url,
			color: message.color
		}),
		sendTeamsMessage(organizationId, { title: message.title, text: message.text, url: message.url })
	]);

	// Dispatch agent triggers for this event
	dispatchAgentTriggers(organizationId, event, payload).catch((err) => {
		console.error('Agent trigger dispatch error:', err);
	});
}

async function dispatchAgentTriggers(
	organizationId: string,
	event: string,
	payload: unknown
): Promise<void> {
	const { data: triggers } = await supabaseAdmin
		.from('org_agent_triggers')
		.select('*, org_agents!inner(id, system_prompt, is_active)')
		.eq('organization_id', organizationId)
		.eq('trigger_type', 'event')
		.eq('event_name', event)
		.eq('is_active', true);

	if (!triggers || triggers.length === 0) return;

	for (const trigger of triggers) {
		const agent = trigger.org_agents as any;
		if (!agent?.is_active) continue;

		try {
			const result = await executeAgent({
				agentId: agent.id,
				orgId: organizationId,
				prompt: trigger.trigger_prompt,
				systemPrompt: agent.system_prompt,
				triggeredBy: 'event',
				triggerId: trigger.id,
				eventContext: payload as Record<string, unknown>
			});

			// Send notification if configured
			if (trigger.notify_channel === 'slack' && result.output) {
				await sendSlackMessage(organizationId, {
					title: `Agent: ${event.replace('_', ' ')}`,
					text: result.output.slice(0, 1500),
					color: '#6366f1'
				});
			} else if (trigger.notify_channel === 'discord' && result.output) {
				await sendDiscordMessage(organizationId, {
					title: `Agent: ${event.replace('_', ' ')}`,
					text: result.output.slice(0, 1500),
					color: '#6366f1'
				});
			}

			// Update last_run_at
			await supabaseAdmin
				.from('org_agent_triggers')
				.update({ last_run_at: new Date().toISOString() })
				.eq('id', trigger.id);
		} catch (err) {
			console.error(`Agent trigger ${trigger.id} failed:`, err);
		}
	}
}
