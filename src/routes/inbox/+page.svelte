<script lang="ts">
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import ComposeModal from '$lib/components/email/ComposeModal.svelte';

	type EmailItem = {
		id: string;
		threadId: string;
		from: string;
		fromEmail: string;
		subject: string;
		snippet: string;
		date: string;
		unread: boolean;
	};

	type ThreadMessage = {
		id: string;
		from: string;
		fromEmail: string;
		date: string;
		body: string;
	};

	let { data } = $props();

	type AccountEmailEntry = { email: string; accountId: string; accountName: string };
	const accountEmailMap = $derived((data.accountEmailMap ?? []) as AccountEmailEntry[]);

	const matchedAccount = $derived(() => {
		if (!selectedEmail) return null;
		const senderEmail = selectedEmail.fromEmail.toLowerCase();
		const exactMatch = accountEmailMap.find((a) => a.email === senderEmail);
		if (exactMatch) return exactMatch;
		const domain = senderEmail.split('@')[1];
		if (
			domain &&
			!['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'].includes(domain)
		) {
			return accountEmailMap.find((a) => a.email.endsWith(`@${domain}`)) ?? null;
		}
		return null;
	});

	let filter = $state<'all' | 'accounts' | 'brands'>('all');
	let searchQuery = $state('');
	let emails = $state<EmailItem[]>([]);
	let loading = $state(false);
	let selectedEmailId = $state<string | null>(null);
	let threadMessages = $state<ThreadMessage[]>([]);
	let threadLoading = $state(false);
	let replyBody = $state('');
	let replySending = $state(false);
	let composeOpen = $state(false);

	const selectedEmail = $derived(emails.find((e) => e.id === selectedEmailId) ?? null);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	function formatRelativeTime(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function parseFromHeader(from: string): { name: string; email: string } {
		const match = from.match(/^(.+?)\s*<(.+?)>$/);
		if (match) return { name: match[1].replace(/"/g, '').trim(), email: match[2] };
		return { name: from, email: from };
	}

	async function fetchEmails() {
		loading = true;
		try {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
			const params = new URLSearchParams();
			if (filter !== 'all') params.set('filter', filter);
			if (searchQuery.trim()) params.set('q', searchQuery.trim());

			const res = await fetch(`/api/email/inbox?${params.toString()}`);
			if (res.ok) {
				const json = await res.json();
				type InboxMsg = {
					id: string;
					threadId: string;
					from?: string;
					subject?: string;
					snippet?: string;
					date?: string;
					isUnread?: boolean;
				};
				emails = (json.messages ?? []).map((m: InboxMsg) => {
					const parsed = parseFromHeader(m.from ?? '');
					return {
						id: m.id,
						threadId: m.threadId,
						from: parsed.name,
						fromEmail: parsed.email,
						subject: m.subject ?? '(no subject)',
						snippet: m.snippet ?? '',
						date: m.date ?? '',
						unread: m.isUnread ?? false
					};
				});
			} else {
				emails = [];
			}
		} catch {
			emails = [];
		} finally {
			loading = false;
		}
	}

	async function fetchThread(threadId: string) {
		threadLoading = true;
		threadMessages = [];
		replyBody = '';
		try {
			const res = await fetch(`/api/email/thread/${threadId}`);
			if (res.ok) {
				const json = await res.json();
				type ThreadMsg = { id: string; from?: string; date?: string; body?: string };
				threadMessages = (json.messages ?? []).map((m: ThreadMsg) => {
					const parsed = parseFromHeader(m.from ?? '');
					return {
						id: m.id,
						from: parsed.name,
						fromEmail: parsed.email,
						date: m.date ?? '',
						body: m.body ?? ''
					};
				});
			}
		} catch {
			threadMessages = [];
		} finally {
			threadLoading = false;
		}
	}

	function selectEmail(email: EmailItem) {
		selectedEmailId = email.id;
		fetchThread(email.threadId);
	}

	async function sendReply() {
		if (!replyBody.trim() || !selectedEmail) return;
		replySending = true;
		try {
			const res = await fetch('/api/email/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					to: selectedEmail.fromEmail,
					subject: `Re: ${selectedEmail.subject}`,
					body: replyBody,
					threadId: selectedEmail.threadId
				})
			});
			if (res.ok) {
				replyBody = '';
				fetchThread(selectedEmail.threadId);
			}
		} catch {
			// Silently handle error
		} finally {
			replySending = false;
		}
	}

	function handleSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			fetchEmails();
		}, 300);
	}

	// Fetch emails on mount and when filter changes
	$effect(() => {
		if (data.connected) {
			// Access filter to create dependency
			void filter;
			fetchEmails();
		}
	});
</script>

{#if !data.connected}
	<div class="flex h-[calc(100vh-200px)] items-center justify-center">
		<div class="max-w-sm text-center">
			<svg
				viewBox="0 0 78 80"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				class="mx-auto h-16 w-16 text-muted-foreground"
			>
				<path
					stroke="currentColor"
					stroke-width="1.5"
					d="M10.4 9.11A10 10 0 0 1 20.22 1h37.56a10 10 0 0 1 9.82 8.11l8.11 42.2a10 10 0 0 1-9.82 11.9H54.7a6.36 6.36 0 0 0-5.65 3.45 6.36 6.36 0 0 1-5.66 3.45H34.6a6.36 6.36 0 0 1-5.66-3.45 6.36 6.36 0 0 0-5.65-3.46H12.1a10 10 0 0 1-9.8-11.89l8.11-42.2Z"
				/>
				<path
					stroke="currentColor"
					stroke-width="1.5"
					d="M14.3 9.03a5 5 0 0 1 4.91-4.08H58.8a5 5 0 0 1 4.91 4.08l8.07 43.22a6 6 0 0 1-5.9 7.1H52.76a5.72 5.72 0 0 0-5.24 3.41 5.72 5.72 0 0 1-5.23 3.42h-6.58a5.72 5.72 0 0 1-5.23-3.42 5.72 5.72 0 0 0-5.24-3.4h-13.1a6 6 0 0 1-5.9-7.1L14.3 9.02Z"
				/>
				<path
					stroke="currentColor"
					stroke-width="1.5"
					d="m2.36 55.6 3.2 14.06A12 12 0 0 0 17.26 79h43.48a12 12 0 0 0 11.7-9.34l3.2-14.06"
				/>
			</svg>
			<h2 class="mt-4 text-lg font-semibold">Connect your email</h2>
			<p class="mt-2 text-sm text-muted-foreground">
				Connect your Gmail account to send and receive emails directly from Threadline.
			</p>
			<Button class="mt-5" href="/settings">Go to Settings</Button>
		</div>
	</div>
{:else if data.connected}
	<div class="flex h-[calc(100vh-120px)] gap-0 overflow-hidden rounded-none border bg-card">
		<!-- Left panel: email list -->
		<div class="flex w-[350px] shrink-0 flex-col border-r">
			<!-- Header -->
			<div class="flex items-center justify-between border-b px-4 py-3">
				<h2 class="text-base font-semibold">Inbox</h2>
				<Button size="sm" onclick={() => (composeOpen = true)}>
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
							d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
						/>
					</svg>
					Compose
				</Button>
			</div>

			<!-- Filter tabs -->
			<div class="flex gap-1 border-b px-4 py-2">
				{#each ['all', 'accounts', 'brands'] as tab (tab)}
					<button
						class={cn(
							'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
							filter === tab
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
						onclick={() => (filter = tab as 'all' | 'accounts' | 'brands')}
					>
						{tab.charAt(0).toUpperCase() + tab.slice(1)}
					</button>
				{/each}
			</div>

			<!-- Search -->
			<div class="border-b px-4 py-2">
				<Input
					placeholder="Search emails..."
					bind:value={searchQuery}
					oninput={handleSearchInput}
				/>
			</div>

			<!-- Email list -->
			<div class="flex-1 overflow-y-auto">
				{#if loading}
					<div class="space-y-1 p-2">
						{#each Array.from({ length: 8 }).map((_, i) => i) as i (i)}
							<div class="animate-pulse rounded-lg p-3">
								<div class="flex items-center gap-3">
									<div class="h-2 w-2 rounded-full bg-muted"></div>
									<div class="h-4 w-32 rounded bg-muted"></div>
									<div class="ml-auto h-3 w-12 rounded bg-muted"></div>
								</div>
								<div class="mt-2 ml-5 h-3.5 w-48 rounded bg-muted"></div>
								<div class="mt-1.5 ml-5 h-3 w-full rounded bg-muted"></div>
							</div>
						{/each}
					</div>
				{:else if emails.length === 0}
					<div class="flex h-full items-center justify-center p-4">
						<p class="text-sm text-muted-foreground">No emails found</p>
					</div>
				{:else}
					<div class="space-y-0.5 p-1">
						{#each emails as email (email.id)}
							<button
								class={cn(
									'flex w-full flex-col gap-1 rounded-lg px-3 py-3 text-left transition-colors',
									selectedEmailId === email.id ? 'bg-accent' : 'hover:bg-muted/50'
								)}
								onclick={() => selectEmail(email)}
							>
								<div class="flex items-center gap-2">
									{#if email.unread}
										<span class="h-2 w-2 shrink-0 rounded-full bg-primary"></span>
									{:else}
										<span class="h-2 w-2 shrink-0"></span>
									{/if}
									<span
										class={cn(
											'flex-1 truncate text-sm',
											email.unread ? 'font-semibold' : 'font-normal'
										)}
									>
										{email.from}
									</span>
									<span class="shrink-0 text-xs text-muted-foreground">
										{formatRelativeTime(email.date)}
									</span>
								</div>
								<div class="ml-4">
									<p
										class={cn('truncate text-sm', email.unread ? 'font-medium' : 'text-foreground')}
									>
										{email.subject}
									</p>
									<p class="mt-0.5 truncate text-sm text-muted-foreground">
										{email.snippet}
									</p>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Right panel: thread view -->
		<div class="flex flex-1 flex-col">
			{#if !selectedEmail}
				<div class="flex h-full items-center justify-center">
					<div class="text-center">
						<svg
							viewBox="0 0 78 80"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							class="mx-auto h-10 w-10 text-muted-foreground/40"
						>
							<path
								stroke="currentColor"
								stroke-width="1.5"
								d="M10.4 9.11A10 10 0 0 1 20.22 1h37.56a10 10 0 0 1 9.82 8.11l8.11 42.2a10 10 0 0 1-9.82 11.9H54.7a6.36 6.36 0 0 0-5.65 3.45 6.36 6.36 0 0 1-5.66 3.45H34.6a6.36 6.36 0 0 1-5.66-3.45 6.36 6.36 0 0 0-5.65-3.46H12.1a10 10 0 0 1-9.8-11.89l8.11-42.2Z"
							/>
							<path
								stroke="currentColor"
								stroke-width="1.5"
								d="M14.3 9.03a5 5 0 0 1 4.91-4.08H58.8a5 5 0 0 1 4.91 4.08l8.07 43.22a6 6 0 0 1-5.9 7.1H52.76a5.72 5.72 0 0 0-5.24 3.41 5.72 5.72 0 0 1-5.23 3.42h-6.58a5.72 5.72 0 0 1-5.23-3.42 5.72 5.72 0 0 0-5.24-3.4h-13.1a6 6 0 0 1-5.9-7.1L14.3 9.02Z"
							/>
							<path
								stroke="currentColor"
								stroke-width="1.5"
								d="m2.36 55.6 3.2 14.06A12 12 0 0 0 17.26 79h43.48a12 12 0 0 0 11.7-9.34l3.2-14.06"
							/>
						</svg>
						<p class="mt-3 text-sm text-muted-foreground">Select an email to read</p>
					</div>
				</div>
			{:else}
				<!-- Thread header -->
				<div class="border-b px-6 py-4">
					<h3 class="text-base font-semibold">{selectedEmail.subject}</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						{selectedEmail.from} &lt;{selectedEmail.fromEmail}&gt;
					</p>
				</div>

				<!-- Account link suggestion -->
				{#if matchedAccount()}
					{@const acct = matchedAccount()}
					<a
						href={resolve(`/accounts/${acct?.accountId}`)}
						class="flex items-center gap-2 border-b bg-blue-50 px-6 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.97a4.5 4.5 0 00-6.364-6.364L5.25 6.268a4.5 4.5 0 001.242 7.244"
							/>
						</svg>
						<span>Linked to <strong>{acct?.accountName}</strong></span>
					</a>
				{/if}

				<!-- Thread messages -->
				<div class="flex-1 overflow-y-auto p-6">
					{#if threadLoading}
						<div class="space-y-4">
							{#each Array.from({ length: 3 }).map((_, i) => i) as i (i)}
								<div class="animate-pulse rounded-none border p-4">
									<div class="flex items-center gap-3">
										<div class="h-4 w-28 rounded bg-muted"></div>
										<div class="h-3 w-20 rounded bg-muted"></div>
									</div>
									<div class="mt-3 space-y-2">
										<div class="h-3 w-full rounded bg-muted"></div>
										<div class="h-3 w-3/4 rounded bg-muted"></div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="space-y-4">
							{#each threadMessages as message (message.id)}
								<div class="rounded-none border bg-background p-4">
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium">{message.from}</span>
										<span class="text-xs text-muted-foreground">
											{formatRelativeTime(message.date)}
										</span>
									</div>
									<div class="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
										{message.body}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Reply area -->
				<div class="border-t p-4">
					<div class="flex gap-3">
						<textarea
							bind:value={replyBody}
							placeholder="Write a reply..."
							rows="3"
							class="flex-1 resize-none rounded-none border border-input bg-background px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
						></textarea>
					</div>
					<div class="mt-3 flex justify-end">
						<Button onclick={sendReply} disabled={replySending || !replyBody.trim()}>
							{replySending ? 'Sending...' : 'Send Reply'}
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<ComposeModal open={composeOpen} ontoggle={() => (composeOpen = !composeOpen)} />
{/if}
