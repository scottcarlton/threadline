<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar/index.js';
	import { markAsRead } from '$lib/stores/notifications.js';
	import { notificationActions } from '$lib/notifications/actions.js';
	import type { NotificationItem } from '$lib/stores/notifications.js';

	type Props = {
		notif: NotificationItem;
		variant?: 'toast' | 'center';
		onDismissRequest?: () => void;
	};

	const { notif, variant = 'center', onDismissRequest }: Props = $props();

	const actions = $derived(notificationActions(notif));
	let optionsOpen = $state(false);
	let menuEl = $state<HTMLDivElement | null>(null);

	function avatarSeed(): string {
		if (!notif.actor_name) return '/T';
		const parts = notif.actor_name.trim().split(/\s+/).filter(Boolean);
		const initials = parts.map((p) => p[0]).join('');
		return (initials || notif.actor_name).slice(0, 2).toUpperCase();
	}

	function relativeTime(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'Just now';
		if (mins < 60) return `${mins}min ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		if (days < 7) return `${days}d ago`;
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	async function activate() {
		if (notif.link) {
			await markAsRead(notif.id);
			onDismissRequest?.();
			goto(resolve(notif.link as '/login'));
		} else {
			await markAsRead(notif.id);
			onDismissRequest?.();
		}
	}

	function onCardKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			activate();
		}
	}

	function handleDocClick(e: MouseEvent) {
		if (!menuEl) return;
		if (!menuEl.contains(e.target as Node)) optionsOpen = false;
	}

	$effect(() => {
		if (!optionsOpen) return;
		document.addEventListener('mousedown', handleDocClick);
		return () => document.removeEventListener('mousedown', handleDocClick);
	});
</script>

<div
	role="button"
	tabindex="0"
	onclick={activate}
	onkeydown={onCardKey}
	class="group relative flex w-full cursor-pointer items-start gap-3 rounded-2xl bg-foreground/80 p-4 text-background shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors hover:bg-foreground/90"
	class:opacity-70={!!notif.read_at && variant === 'center'}
>
	<Avatar class="h-10 w-10 shrink-0">
		<AvatarFallback
			class="text-sm font-semibold {notif.actor_name
				? 'bg-background/15 text-background'
				: 'bg-black text-white'}"
		>
			{avatarSeed()}
		</AvatarFallback>
	</Avatar>

	<div class="min-w-0 flex-1 pr-2">
		<p class="truncate text-sm font-semibold">{notif.title}</p>
		{#if notif.body}
			<p class="mt-0.5 truncate text-sm text-background/70">{notif.body}</p>
		{/if}
	</div>

	<!-- Right rail: timestamp by default, action pills on hover/focus -->
	<div class="relative flex shrink-0 items-start">
		<span
			class="text-xs whitespace-nowrap text-background/60 transition-opacity group-focus-within:opacity-0 group-hover:opacity-0"
		>
			{relativeTime(notif.created_at)}
		</span>

		<div
			class="pointer-events-none absolute top-0 -right-3 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
		>
			{#if actions.primary}
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						activate();
					}}
					class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-background hover:bg-background/10"
				>
					{actions.primary.label}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3.5 w-3.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			{/if}

			{#if actions.secondary.length > 1 || (!actions.primary && actions.secondary.length > 0)}
				<div bind:this={menuEl} class="relative">
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							optionsOpen = !optionsOpen;
						}}
						class="flex items-center gap-1 rounded-md bg-background/10 px-1.5 py-0.5 text-xs font-medium text-background hover:bg-background/20"
						aria-haspopup="menu"
						aria-expanded={optionsOpen}
					>
						Options
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 8.25l-7.5 7.5-7.5-7.5"
							/>
						</svg>
					</button>

					{#if optionsOpen}
						<div
							role="menu"
							class="absolute top-full right-0 z-50 mt-1 min-w-36 overflow-hidden rounded-lg bg-foreground py-1 shadow-xl ring-1 ring-background/10"
						>
							{#if actions.primary}
								<button
									type="button"
									role="menuitem"
									onclick={(e) => {
										e.stopPropagation();
										optionsOpen = false;
										activate();
									}}
									class="block w-full px-3 py-2 text-left text-sm text-background hover:bg-background/10"
								>
									View
								</button>
							{/if}
							{#each actions.secondary as item (item.label)}
								<button
									type="button"
									role="menuitem"
									onclick={(e) => {
										e.stopPropagation();
										optionsOpen = false;
										item.run(notif);
									}}
									class="block w-full px-3 py-2 text-left text-sm text-background hover:bg-background/10"
								>
									{item.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
