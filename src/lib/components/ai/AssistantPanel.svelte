<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { conversation } from '$lib/stores/conversation.js';
	import type { FileAttachment } from '$lib/stores/conversation.js';
	import type { UserRole } from '$lib/types/database.js';
	import { preferences } from '$lib/stores/preferences.js';
	const { messages, loading } = conversation;

	const chatFontStyle = $derived(
		$preferences.chatFont === 'sans'
			? 'font-family: Georgia, "Times New Roman", serif; font-size: 16px'
			: $preferences.chatFont === 'system'
				? 'font-family: system-ui, sans-serif; font-size: 16px'
				: 'font-family: var(--font-sans); font-size: 16px'
	);

	type Props = {
		open: boolean;
		ontoggle: () => void;
		role?: UserRole;
	};

	let { open, ontoggle, role = 'member' }: Props = $props();

	let inputValue = $state('');
	let messagesContainer = $state<HTMLDivElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let attachedFiles = $state<{ file: File; preview?: string }[]>([]);
	let voiceState = $state<'idle' | 'listening' | 'speaking'>('idle');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let recognition = $state<any>(null);
	let currentAudio = $state<HTMLAudioElement | null>(null);

	const hasText = $derived(inputValue.trim().length > 0);
	const hasAttachments = $derived(attachedFiles.length > 0);

	const suggestedPrompts: Record<string, string[]> = {
		admin: [
			'Summarize my orders this season',
			"Which accounts haven't ordered yet?",
			"What's our revenue by brand?",
			'Create a new brand'
		],
		owner: [
			'Summarize my orders this season',
			"Which accounts haven't ordered yet?",
			"What's our revenue by brand?",
			'Create a new brand'
		],
		member: [
			'Show me my brand orders',
			'What accounts have ordered recently?',
			'Create an order',
			'Show me revenue metrics'
		],
		guest: [
			'Show me current orders',
			'How many brands are there?',
			'What shows are coming up?',
			'Show me revenue metrics'
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

	async function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				resolve(result.split(',')[1]);
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	async function handleSend(text?: string) {
		const msg = text ?? inputValue.trim();
		if (!msg && !hasAttachments) return;

		let files: FileAttachment[] | undefined;
		if (attachedFiles.length > 0) {
			files = await Promise.all(
				attachedFiles.map(async ({ file }) => ({
					name: file.name,
					type: file.type,
					data: await fileToBase64(file),
					size: file.size
				}))
			);
		}

		inputValue = '';
		attachedFiles = [];
		await conversation.sendMessage(msg || 'What is this file?', files);
		scrollToBottom();

		// Play AI voice response if we were in voice mode
		if (voiceState === 'listening' || voiceState === 'speaking') {
			const allMessages = $messages;
			const lastMessage = allMessages[allMessages.length - 1];
			if (lastMessage?.role === 'assistant') {
				await playVoiceResponse(lastMessage.content);
			}
		}
	}

	async function playVoiceResponse(text: string) {
		voiceState = 'speaking';
		try {
			const res = await fetch('/api/voice', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: text.slice(0, 1000), voiceId: $preferences.voiceId })
			});
			if (!res.ok) {
				voiceState = 'idle';
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			currentAudio = audio;
			audio.onended = () => {
				voiceState = 'idle';
				currentAudio = null;
				URL.revokeObjectURL(url);
			};
			audio.play();
		} catch {
			voiceState = 'idle';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			ontoggle();
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;
		for (const file of input.files) {
			const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
			attachedFiles = [...attachedFiles, { file, preview }];
		}
		input.value = '';
	}

	function removeFile(index: number) {
		const removed = attachedFiles[index];
		if (removed.preview) URL.revokeObjectURL(removed.preview);
		attachedFiles = attachedFiles.filter((_, i) => i !== index);
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}

	function toggleVoice() {
		if (voiceState === 'listening') {
			stopListening();
			return;
		}
		if (voiceState === 'speaking') {
			if (currentAudio) {
				currentAudio.pause();
				currentAudio = null;
			}
			voiceState = 'idle';
			return;
		}
		startListening();
	}

	function startListening() {
		const SpeechRecognition =
			(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SpeechRecognition) {
			inputValue = '(Voice input not supported in this browser)';
			return;
		}
		recognition = new SpeechRecognition();
		recognition.continuous = false;
		recognition.interimResults = true;
		recognition.lang = 'en-US';

		recognition.onresult = (event: any) => {
			let transcript = '';
			for (let i = 0; i < event.results.length; i++) {
				transcript += event.results[i][0].transcript;
			}
			inputValue = transcript;
		};

		recognition.onend = () => {
			if (voiceState === 'listening') {
				voiceState = 'idle';
				if (inputValue.trim()) {
					handleSend();
				}
			}
		};

		recognition.onerror = () => {
			voiceState = 'idle';
		};

		voiceState = 'listening';
		recognition.start();
	}

	function stopListening() {
		if (recognition) {
			recognition.stop();
			recognition = null;
		}
		voiceState = 'idle';
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onclick={ontoggle}></div>
{/if}

<div
	class={cn(
		'fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl transition-transform duration-300 ease-in-out sm:w-[28rem]',
		open ? 'translate-x-0' : 'translate-x-full'
	)}
>
	<!-- Header -->
	<div class="flex items-center justify-between border-b px-5 py-3.5">
		<div class="flex items-center gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4 text-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
				/>
			</svg>
			<h2 class="text-[13px] font-semibold">AI Assistant</h2>
		</div>
		<button
			onclick={ontoggle}
			class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			aria-label="Close assistant"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>

	<!-- Messages -->
	<div
		bind:this={messagesContainer}
		class="flex-1 space-y-3 overflow-y-auto p-4"
		style={chatFontStyle}
	>
		{#if $messages.length === 0 && !$loading}
			<div class="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
				<div class="rounded-full bg-muted p-3">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 text-muted-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
						/>
					</svg>
				</div>
				<div>
					<p class="text-[13px] font-medium">How can I help?</p>
					<p class="mt-1 text-[12px] text-muted-foreground">
						Ask about orders, brands, accounts, or anything in Threadline.
					</p>
				</div>
				<div class="mt-2 flex w-full flex-col gap-1.5">
					{#each currentPrompts as prompt (prompt)}
						<button
							class="rounded-lg border px-3 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={() => handleSend(prompt)}
						>
							{prompt}
						</button>
					{/each}
				</div>
			</div>
		{:else}
			{#each $messages as msg, i (i)}
				<div class={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
					<div
						class={cn(
							'max-w-[85%] rounded-none px-3.5 py-2.5 text-[13px] leading-relaxed',
							msg.role === 'user'
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-foreground'
						)}
					>
						{#if msg.attachments && msg.attachments.length > 0}
							<div class="mb-2 flex flex-wrap gap-1.5">
								{#each msg.attachments as attachment, ai (ai)}
									<span
										class="inline-flex items-center gap-1 rounded bg-black/10 px-1.5 py-0.5 text-[11px]"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
											/>
										</svg>
										{attachment.name}
									</span>
								{/each}
							</div>
						{/if}
						<p class="whitespace-pre-wrap">{msg.content}</p>
					</div>
				</div>
			{/each}

			{#if $loading}
				<div class="flex justify-start">
					<div class="flex items-center gap-1.5 rounded-none bg-muted px-3.5 py-2.5">
						<div class="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40"></div>
						<div
							class="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40"
							style="animation-delay: 0.15s"
						></div>
						<div
							class="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40"
							style="animation-delay: 0.3s"
						></div>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Input -->
	<div class="p-4 pt-2">
		<div
			class="rounded-none border bg-background shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
		>
			<!-- Textarea -->
			<textarea
				bind:value={inputValue}
				onkeydown={handleKeydown}
				placeholder="Ask anything..."
				rows={1}
				disabled={$loading}
				class="w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-[14px] placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
				style={chatFontStyle}
			></textarea>

			<!-- Attached files -->
			{#if hasAttachments}
				<div class="flex flex-wrap gap-2 px-3 pb-1">
					{#each attachedFiles as { file, preview }, i (i)}
						<div
							class="group relative flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2 py-1"
						>
							{#if preview}
								<img src={preview} alt={file.name} class="h-8 w-8 rounded object-cover" />
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 text-muted-foreground"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
									/>
								</svg>
							{/if}
							<div class="flex flex-col">
								<span class="max-w-[120px] truncate text-[11px] font-medium">{file.name}</span>
								<span class="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</span>
							</div>
							<button
								onclick={() => removeFile(i)}
								class="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								aria-label="Remove file"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3.5 w-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Toolbar row -->
			<div class="flex items-center justify-between px-3 pt-1 pb-2.5">
				<!-- Left: Add file -->
				<input
					bind:this={fileInput}
					type="file"
					multiple
					accept="image/*,.pdf,.csv,.txt,.json,.xlsx,.xls,.doc,.docx"
					onchange={handleFileSelect}
					class="hidden"
				/>
				<button
					onclick={() => fileInput?.click()}
					disabled={$loading}
					class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
					aria-label="Attach file"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
				</button>

				<!-- Right: Voice or Send -->
				{#if hasText || hasAttachments}
					<!-- Send button -->
					<button
						onclick={() => handleSend()}
						disabled={$loading}
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
						aria-label="Send message"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
							/>
						</svg>
					</button>
				{:else if voiceState === 'listening'}
					<!-- Voice active: wave animation -->
					<button
						onclick={toggleVoice}
						class="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors"
						aria-label="Stop listening"
					>
						<div class="flex items-center gap-[3px]">
							<span class="voice-bar h-3 w-[3px] rounded-full bg-current"></span>
							<span
								class="voice-bar h-4 w-[3px] rounded-full bg-current"
								style="animation-delay: 0.15s"
							></span>
							<span
								class="voice-bar h-2.5 w-[3px] rounded-full bg-current"
								style="animation-delay: 0.3s"
							></span>
							<span
								class="voice-bar h-3.5 w-[3px] rounded-full bg-current"
								style="animation-delay: 0.45s"
							></span>
						</div>
					</button>
				{:else if voiceState === 'speaking'}
					<!-- AI speaking: wave animation -->
					<button
						onclick={toggleVoice}
						class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors"
						aria-label="Stop speaking"
					>
						<div class="flex items-center gap-[3px]">
							<span class="voice-bar h-3 w-[3px] rounded-full bg-current"></span>
							<span
								class="voice-bar h-4 w-[3px] rounded-full bg-current"
								style="animation-delay: 0.15s"
							></span>
							<span
								class="voice-bar h-2.5 w-[3px] rounded-full bg-current"
								style="animation-delay: 0.3s"
							></span>
							<span
								class="voice-bar h-3.5 w-[3px] rounded-full bg-current"
								style="animation-delay: 0.45s"
							></span>
						</div>
					</button>
				{:else}
					<!-- Mic button (idle) -->
					<button
						onclick={toggleVoice}
						disabled={$loading}
						class="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-foreground transition-colors hover:bg-foreground/20 disabled:opacity-50"
						aria-label="Voice input"
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
								d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
							/>
						</svg>
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.voice-bar {
		animation: voice-wave 0.6s ease-in-out infinite alternate;
	}

	@keyframes voice-wave {
		0% {
			transform: scaleY(0.4);
		}
		100% {
			transform: scaleY(1);
		}
	}
</style>
