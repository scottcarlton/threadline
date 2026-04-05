<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { UserRole } from '$lib/types/database.js';

	type Message = {
		role: 'user' | 'assistant';
		content: string;
	};

	type Props = {
		open: boolean;
		ontoggle: () => void;
		role?: UserRole;
	};

	let { open, ontoggle, role = 'member' }: Props = $props();

	let messages = $state<Message[]>([]);
	let inputValue = $state('');
	let loading = $state(false);
	let messagesContainer = $state<HTMLDivElement | null>(null);

	const suggestedPrompts: Record<string, string[]> = {
		admin: [
			'Show me a summary of all orders this season',
			'Create a new brand called "Luxe Label"',
			'How many active accounts do we have?',
			'What are our top brands by revenue?'
		],
		owner: [
			'Show me a summary of all orders this season',
			'Create a new brand called "Luxe Label"',
			'How many active accounts do we have?',
			'What are our top brands by revenue?'
		],
		member: [
			'Show me my brand orders',
			'What accounts have placed orders recently?',
			'Create an order for my brand',
			'Show me dashboard metrics'
		],
		guest: [
			'Show me current orders',
			'How many brands are there?',
			'What shows are coming up?',
			'Show me dashboard metrics'
		]
	};

	const currentPrompts = $derived(suggestedPrompts[role] ?? suggestedPrompts.member);

	function scrollToBottom() {
		if (messagesContainer) {
			requestAnimationFrame(() => {
				messagesContainer!.scrollTop = messagesContainer!.scrollHeight;
			});
		}
	}

	async function sendMessage(text?: string) {
		const msg = text ?? inputValue.trim();
		if (!msg || loading) return;

		inputValue = '';
		messages = [...messages, { role: 'user', content: msg }];
		loading = true;
		scrollToBottom();

		try {
			// Build conversation history (exclude the latest user message, it's sent as `message`)
			const conversationHistory = messages.slice(0, -1).map((m) => ({
				role: m.role,
				content: m.content
			}));

			const res = await fetch('/api/ai', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: msg,
					conversationHistory
				})
			});

			const data = await res.json();

			if (!res.ok) {
				messages = [
					...messages,
					{ role: 'assistant', content: data.error ?? 'Something went wrong. Please try again.' }
				];
			} else {
				messages = [...messages, { role: 'assistant', content: data.response }];
			}
		} catch {
			messages = [
				...messages,
				{ role: 'assistant', content: 'Network error. Please check your connection and try again.' }
			];
		} finally {
			loading = false;
			scrollToBottom();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			ontoggle();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- Backdrop -->
{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onclick={ontoggle}></div>
{/if}

<!-- Panel -->
<div
	class={cn(
		'fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl transition-transform duration-300 ease-in-out sm:w-[28rem]',
		open ? 'translate-x-0' : 'translate-x-full'
	)}
>
	<!-- Header -->
	<div class="flex items-center justify-between border-b px-4 py-3">
		<div class="flex items-center gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 text-primary"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
				/>
			</svg>
			<h2 class="text-sm font-semibold">AI Assistant</h2>
			<kbd
				class="ml-2 hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block"
			>
				{navigator?.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}+K
			</kbd>
		</div>
		<button
			onclick={ontoggle}
			class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
			aria-label="Close assistant"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>

	<!-- Messages -->
	<div bind:this={messagesContainer} class="flex-1 space-y-4 overflow-y-auto p-4">
		{#if messages.length === 0 && !loading}
			<div class="flex h-full flex-col items-center justify-center gap-4 text-center">
				<div class="rounded-full bg-primary/10 p-3">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-8 w-8 text-primary"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M13 10V3L4 14h7v7l9-11h-7z"
						/>
					</svg>
				</div>
				<div>
					<p class="text-sm font-medium">How can I help?</p>
					<p class="mt-1 text-xs text-muted-foreground">
						Ask me about orders, brands, accounts, or anything in ThreadLine.
					</p>
				</div>
				<div class="mt-2 flex w-full flex-col gap-2">
					{#each currentPrompts as prompt}
						<button
							class="rounded-md border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={() => sendMessage(prompt)}
						>
							{prompt}
						</button>
					{/each}
				</div>
			</div>
		{:else}
			{#each messages as msg}
				<div class={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
					<div
						class={cn(
							'max-w-[85%] rounded-lg px-3 py-2 text-sm',
							msg.role === 'user'
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-foreground'
						)}
					>
						<p class="whitespace-pre-wrap">{msg.content}</p>
					</div>
				</div>
			{/each}

			{#if loading}
				<div class="flex justify-start">
					<div class="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2">
						<div class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"></div>
						<div
							class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
							style="animation-delay: 0.1s"
						></div>
						<div
							class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
							style="animation-delay: 0.2s"
						></div>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Input -->
	<div class="border-t p-4">
		<div class="flex items-end gap-2">
			<textarea
				bind:value={inputValue}
				onkeydown={handleKeydown}
				placeholder="Ask anything about your data..."
				rows={1}
				disabled={loading}
				class="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
			></textarea>
			<Button
				size="sm"
				disabled={loading || !inputValue.trim()}
				onclick={() => sendMessage()}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 19V5m0 0l-7 7m7-7l7 7"
					/>
				</svg>
			</Button>
		</div>
	</div>
</div>
