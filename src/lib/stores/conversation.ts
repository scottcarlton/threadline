import { writable, get } from 'svelte/store';
import { invalidate, invalidateAll } from '$app/navigation';
import { page } from '$app/stores';
import { entityContext } from './entityContext.js';

export type FileAttachment = {
	name: string;
	type: string;
	data: string; // base64
	size: number;
};

export type Message = {
	role: 'user' | 'assistant';
	content: string;
	suggestions?: string[];
	attachments?: FileAttachment[];
	// Lightweight per-message progress so the UI can show "Running query_data…"
	// while tools run. Cleared once the response is finalized.
	toolProgress?: string[];
	streaming?: boolean;
};

export type ActiveAgent = {
	id: string;
	name: string;
	slug: string;
} | null;

const MAX_HISTORY = 10;

// Map each tool name to the invalidation keys it affects. Pages declare
// dependencies with `depends('data:key')` in their load fn; for any tool
// whose keys aren't listed we fall back to invalidateAll().
const TOOL_INVALIDATION_KEYS: Record<string, string[]> = {
	create_brand: ['data:brands', 'data:dashboard'],
	update_brand: ['data:brands', 'data:dashboard'],
	create_account: ['data:accounts', 'data:dashboard'],
	update_account: ['data:accounts'],
	create_order: ['data:orders', 'data:dashboard'],
	update_order: ['data:orders'],
	update_order_status: ['data:orders', 'data:dashboard'],
	add_order_lines: ['data:orders'],
	update_order_line: ['data:orders'],
	remove_order_line: ['data:orders'],
	create_season: ['data:seasons'],
	create_show: ['data:shows'],
	create_territory: ['data:territories'],
	update_territory: ['data:territories'],
	assign_account_territory: ['data:accounts', 'data:territories'],
	create_appointment: ['data:appointments'],
	update_appointment: ['data:appointments'],
	delete_appointment: ['data:appointments'],
	archive_entity: ['data:brands', 'data:accounts'],
	add_product: ['data:products'],
	send_email: [],
	draft_email: []
};

// Pure-read tools never mutate state, so we skip invalidation entirely.
const READ_ONLY_TOOLS = new Set([
	'query_data',
	'list_brands',
	'list_accounts',
	'get_dashboard_metrics',
	'get_sales_report',
	'get_style_velocity',
	'get_commission_report',
	'get_account_health',
	'search_emails',
	'list_notion_databases',
	'pull_from_notion'
]);

export function windowHistory(
	history: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
	if (history.length <= MAX_HISTORY) return history;
	const older = history.slice(0, -MAX_HISTORY);
	// Summary of what was discussed earlier — kept terse so we don't burn
	// tokens re-stating the conversation verbatim.
	const topics = older
		.filter((m) => m.role === 'user')
		.map((m) => m.content.split(/[.?!]/)[0].slice(0, 80))
		.slice(-5)
		.map((s) => s.trim())
		.filter(Boolean)
		.join(' · ');
	const summary = topics
		? `[Earlier in this conversation the user asked about: ${topics}]`
		: '[This conversation has been running a while; prior messages were trimmed.]';
	return [
		{ role: 'user', content: summary },
		{ role: 'assistant', content: 'Understood, I have that context.' },
		...history.slice(-MAX_HISTORY)
	];
}

export function planInvalidation(actions: Array<{ tool: string }>): {
	keys: string[];
	full: boolean;
} {
	if (actions.length === 0) return { keys: [], full: false };
	const writeActions = actions.filter((a) => !READ_ONLY_TOOLS.has(a.tool));
	if (writeActions.length === 0) return { keys: [], full: false };

	const keys = new Set<string>();
	for (const action of writeActions) {
		const toolKeys = TOOL_INVALIDATION_KEYS[action.tool];
		if (toolKeys === undefined) return { keys: [], full: true };
		for (const key of toolKeys) keys.add(key);
	}
	return { keys: [...keys], full: false };
}

async function invalidateAfterActions(actions: Array<{ tool: string }>) {
	const plan = planInvalidation(actions);
	if (plan.full) {
		await invalidateAll();
		return;
	}
	await Promise.all(plan.keys.map((key) => invalidate(key)));
}

function createConversationStore() {
	const messages = writable<Message[]>([]);
	const loading = writable(false);
	const activeAgent = writable<ActiveAgent>(null);

	async function sendMessage(text: string, files?: FileAttachment[]) {
		const userMessage: Message = { role: 'user', content: text, attachments: files };
		messages.update((m) => [...m, userMessage]);
		loading.set(true);

		const currentPage = get(page)?.url?.pathname ?? '/';
		const entity = get(entityContext);
		const agent = get(activeAgent);

		try {
			const rawHistory = get(messages).map((m) => ({
				role: m.role,
				content: m.content
			}));
			const history = windowHistory(rawHistory.slice(0, -1));

			// Skip streaming when files are attached — the multimodal path
			// uses Sonnet vision which doesn't compose cleanly with our
			// stream helper's text/tool event model.
			const canStream = !files || files.length === 0;

			const body = JSON.stringify({
				message: text,
				files: files?.map((f) => ({ name: f.name, type: f.type, data: f.data })),
				conversationHistory: history,
				currentPage,
				entityContext: entity.summary ? entity : undefined,
				agentId: agent?.id ?? undefined,
				stream: canStream
			});

			const res = await fetch('/api/ai', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body
			});

			const isStream =
				canStream && res.body && res.headers.get('content-type')?.includes('text/event-stream');

			if (!isStream) {
				const data = await res.json();
				const assistantMessage: Message = {
					role: 'assistant',
					content: data.response ?? "Sorry, I couldn't process that request.",
					suggestions: data.suggestions
				};
				messages.update((m) => [...m, assistantMessage]);
				if (data.actions?.length) await invalidateAfterActions(data.actions);
				return;
			}

			// Append a placeholder assistant message and mutate it as stream deltas arrive.
			messages.update((m) => [
				...m,
				{ role: 'assistant', content: '', streaming: true, toolProgress: [] }
			]);

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let finalActions: Array<{ tool: string }> | undefined;

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let newlineIndex;
				while ((newlineIndex = buffer.indexOf('\n\n')) !== -1) {
					const chunk = buffer.slice(0, newlineIndex).trim();
					buffer = buffer.slice(newlineIndex + 2);
					if (!chunk.startsWith('data:')) continue;
					const payload = chunk.slice(5).trim();
					if (!payload) continue;
					let event: Record<string, unknown>;
					try {
						event = JSON.parse(payload);
					} catch {
						continue;
					}
					applyStreamEvent(event, messages);
					if (event.type === 'done') {
						finalActions = event.actions as Array<{ tool: string }> | undefined;
					}
				}
			}

			// Clear the streaming flag on the last assistant message.
			messages.update((m) => {
				const last = m[m.length - 1];
				if (last && last.role === 'assistant') last.streaming = false;
				return [...m];
			});

			if (finalActions?.length) await invalidateAfterActions(finalActions);
		} catch {
			messages.update((m) => [
				...m,
				{ role: 'assistant', content: 'Something went wrong. Please try again.' }
			]);
		} finally {
			loading.set(false);
		}
	}

	function clear() {
		messages.set([]);
		activeAgent.set(null);
	}

	function setAgent(agent: ActiveAgent) {
		activeAgent.set(agent);
	}

	return { messages, loading, activeAgent, sendMessage, clear, setAgent };
}

function applyStreamEvent(
	event: Record<string, unknown>,
	messages: ReturnType<typeof writable<Message[]>>
) {
	const type = event.type as string;
	messages.update((m) => {
		const last = m[m.length - 1];
		if (!last || last.role !== 'assistant') return m;
		if (type === 'text' && typeof event.delta === 'string') {
			last.content += event.delta;
		} else if (type === 'tool_start' && typeof event.name === 'string') {
			last.toolProgress = [...(last.toolProgress ?? []), `Running ${event.name}…`];
		} else if (type === 'tool_result' && typeof event.name === 'string') {
			const ok = event.ok !== false;
			last.toolProgress = [
				...(last.toolProgress ?? []),
				ok ? `✓ ${event.name}` : `✗ ${event.name}`
			];
		} else if (type === 'done') {
			if (typeof event.response === 'string' && event.response.length > 0) {
				last.content = event.response;
			}
			if (Array.isArray(event.suggestions)) {
				last.suggestions = event.suggestions as string[];
			}
			last.toolProgress = undefined;
		} else if (type === 'error') {
			last.content = (event.error as string) || 'Something went wrong.';
		}
		return [...m];
	});
}

export const conversation = createConversationStore();
