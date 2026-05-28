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

const EVENT_FORMATTERS: {
	[E in IntegrationEvent]: (payload: EventPayload[E]) => SlackMessage;
} = {
	order_submitted: (p) => ({
		title: 'New Order Submitted',
		text: `*${p.orderNumber}* for ${p.accountName} (${p.brandName}) — $${p.total.toLocaleString()}`,
		url: p.url,
		color: '#16a34a'
	}),
	order_confirmed: (p) => ({
		title: 'Order Confirmed',
		text: `*${p.orderNumber}* for ${p.accountName} has been confirmed`,
		url: p.url,
		color: '#2563eb'
	}),
	order_shipped: (p) => ({
		title: 'Order Shipped',
		text: `*${p.orderNumber}* for ${p.accountName} has shipped`,
		url: p.url,
		color: '#7c3aed'
	}),
	order_cancelled: (p) => ({
		title: 'Order Cancelled',
		text: `*${p.orderNumber}* for ${p.accountName} was cancelled${p.reason ? `: ${p.reason}` : ''}`,
		url: p.url,
		color: '#dc2626'
	}),
	new_account: (p) => ({
		title: 'New Account Created',
		text: `*${p.accountName}*${p.city ? ` — ${p.city}, ${p.state}` : ''}`,
		url: p.url,
		color: '#18181b'
	})
};

type OrderStatus = 'submitted' | 'confirmed' | 'shipped' | 'cancelled';

const STATUS_TO_EVENT: Record<OrderStatus, IntegrationEvent> = {
	submitted: 'order_submitted',
	confirmed: 'order_confirmed',
	shipped: 'order_shipped',
	cancelled: 'order_cancelled'
};

export async function emitOrderEvent(
	organizationId: string,
	orderId: string,
	status: OrderStatus,
	origin: string,
	opts?: { reason?: string }
): Promise<void> {
	try {
		const { data } = await supabaseAdmin
			.from('orders')
			.select('order_number, total_amount, accounts(business_name), brands(name)')
			.eq('id', orderId)
			.single();
		if (!data) return;

		const account = data.accounts as
			| { business_name?: string }
			| { business_name?: string }[]
			| null;
		const brand = data.brands as { name?: string } | { name?: string }[] | null;
		const accountName =
			(Array.isArray(account) ? account[0]?.business_name : account?.business_name) ??
			'Unknown account';
		const brandName = (Array.isArray(brand) ? brand[0]?.name : brand?.name) ?? 'Unknown brand';
		const url = `${origin}/orders/${orderId}`;
		const orderNumber = (data as { order_number: string }).order_number;
		const total = Number((data as { total_amount: number | null }).total_amount ?? 0);
		const event = STATUS_TO_EVENT[status];

		if (event === 'order_submitted') {
			await emitIntegrationEvent(organizationId, 'order_submitted', {
				orderNumber,
				accountName,
				brandName,
				total,
				url
			});
		} else if (event === 'order_confirmed') {
			await emitIntegrationEvent(organizationId, 'order_confirmed', {
				orderNumber,
				accountName,
				url
			});
		} else if (event === 'order_shipped') {
			await emitIntegrationEvent(organizationId, 'order_shipped', {
				orderNumber,
				accountName,
				url
			});
		} else if (event === 'order_cancelled') {
			await emitIntegrationEvent(organizationId, 'order_cancelled', {
				orderNumber,
				accountName,
				url,
				reason: opts?.reason
			});
		}
	} catch (err) {
		console.error('[events] emitOrderEvent failed', { orderId, status, err });
	}
}

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
		.select('*, org_agents!inner(id, system_prompt, is_active, tool_whitelist)')
		.eq('organization_id', organizationId)
		.eq('trigger_type', 'event')
		.eq('event_name', event)
		.eq('is_active', true);

	if (!triggers || triggers.length === 0) return;

	type JoinedAgent = {
		id: string;
		system_prompt: string;
		is_active: boolean;
		tool_whitelist: string[] | null;
	};
	const RATE_LIMIT_MS = 60_000;
	const now = Date.now();

	for (const trigger of triggers) {
		const joined = trigger.org_agents as JoinedAgent | JoinedAgent[] | null;
		const agent = Array.isArray(joined) ? joined[0] : joined;
		if (!agent?.is_active) continue;

		// Rate limit: skip if this trigger ran within the last 60 seconds.
		// Prevents runaway executions during bulk operations.
		if (trigger.last_run_at) {
			const lastRun = new Date(trigger.last_run_at).getTime();
			if (now - lastRun < RATE_LIMIT_MS) {
				console.log(
					`Skipping trigger ${trigger.id}: ran ${now - lastRun}ms ago (< ${RATE_LIMIT_MS}ms)`
				);
				continue;
			}
		}

		try {
			const result = await executeAgent({
				agentId: agent.id,
				orgId: organizationId,
				prompt: trigger.trigger_prompt,
				systemPrompt: agent.system_prompt,
				triggeredBy: 'event',
				triggerId: trigger.id,
				eventContext: payload as Record<string, unknown>,
				toolWhitelist: agent.tool_whitelist
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
