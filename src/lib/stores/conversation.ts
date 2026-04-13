import { writable, get } from 'svelte/store';
import { invalidateAll } from '$app/navigation';
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
};

export type ActiveAgent = {
	id: string;
	name: string;
	slug: string;
} | null;

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
			const history = get(messages).map((m) => ({
				role: m.role,
				content: m.content
			}));

			const res = await fetch('/api/ai', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: text,
					files: files?.map((f) => ({ name: f.name, type: f.type, data: f.data })),
					conversationHistory: history.slice(0, -1),
					currentPage,
					entityContext: entity.summary ? entity : undefined,
					agentId: agent?.id ?? undefined
				})
			});

			const data = await res.json();
			const assistantMessage: Message = {
				role: 'assistant',
				content: data.response ?? "Sorry, I couldn't process that request.",
				suggestions: data.suggestions
			};
			messages.update((m) => [...m, assistantMessage]);

			// If the AI executed any tool actions, refresh page data
			if (data.actions && data.actions.length > 0) {
				invalidateAll();
			}
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

export const conversation = createConversationStore();
