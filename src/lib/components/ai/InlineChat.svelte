<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { conversation } from '$lib/stores/conversation.js';
	const { messages, loading } = conversation;

	type Props = {
		suggestedPrompts?: string[];
	};

	let { suggestedPrompts = [] }: Props = $props();

	let inputValue = $state('');
	let messagesContainer = $state<HTMLDivElement | null>(null);

	function scrollToBottom() {
		if (messagesContainer) {
			requestAnimationFrame(() => {
				messagesContainer!.scrollTop = messagesContainer!.scrollHeight;
			});
		}
	}

	async function handleSend(text?: string) {
		const msg = text ?? inputValue.trim();
		if (!msg) return;
		inputValue = '';
		await conversation.sendMessage(msg);
		scrollToBottom();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}
</script>

<div class="rounded-none border bg-card">
	<!-- Messages area -->
	<div bind:this={messagesContainer} class="max-h-[400px] overflow-y-auto p-5">
		{#if $messages.length === 0 && !$loading}
			<div class="text-center py-6">
				<p class="text-[13px] text-muted-foreground">
					Ask anything about your business
				</p>
				{#if suggestedPrompts.length > 0}
					<div class="mt-4 flex flex-wrap justify-center gap-2">
						{#each suggestedPrompts as prompt}
							<button
								class="rounded-lg border px-3 py-1.5 text-[12px] text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
								onclick={() => handleSend(prompt)}
							>
								{prompt}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="space-y-3">
				{#each $messages as msg}
					<div class={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
						<div
							class={cn(
								'max-w-[80%] rounded-none px-3.5 py-2.5 text-[13px] leading-relaxed',
								msg.role === 'user'
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-foreground'
							)}
						>
							<p class="whitespace-pre-wrap">{msg.content}</p>
						</div>
					</div>
				{/each}

				{#if $loading}
					<div class="flex justify-start">
						<div class="flex items-center gap-1.5 rounded-none bg-muted px-3.5 py-2.5">
							<div class="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40"></div>
							<div class="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40" style="animation-delay: 0.15s"></div>
							<div class="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40" style="animation-delay: 0.3s"></div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Input -->
	<div class="border-t px-5 py-3.5">
		<div class="flex items-center gap-2">
			<input
				bind:value={inputValue}
				onkeydown={handleKeydown}
				placeholder="Ask anything..."
				disabled={$loading}
				class="flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
			/>
			<button
				disabled={$loading || !inputValue.trim()}
				onclick={() => handleSend()}
				aria-label="Send message"
				class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
				</svg>
			</button>
		</div>
	</div>
</div>
