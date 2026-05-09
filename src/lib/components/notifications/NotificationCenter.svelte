<script lang="ts">
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { notifications } from '$lib/stores/notifications.js';
	import NotificationCard from './NotificationCard.svelte';

	type Props = { open: boolean; onclose: () => void };
	const { open, onclose }: Props = $props();

	const items = $derived($notifications);

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.stopImmediatePropagation();
			e.preventDefault();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[59]" onmousedown={onclose}></div>
	<aside
		class="pointer-events-none fixed top-12 right-0 z-[60] flex h-[calc(100dvh-3rem)] w-full flex-col gap-2 overflow-y-auto bg-transparent p-3 sm:w-[400px]"
		transition:fly={{ x: 420, duration: 280, easing: quintOut }}
		aria-label="Notifications"
	>
		{#if items.length === 0}
			<div
				class="pointer-events-auto flex w-full items-start gap-3 rounded-2xl bg-foreground/80 p-4 text-background shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md"
			>
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background/15"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
						/>
					</svg>
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold">You're all caught up</p>
					<p class="mt-0.5 text-sm text-background/70">
						New activity will show up here as it happens.
					</p>
				</div>
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each items as notif (notif.id)}
					<div class="pointer-events-auto">
						<NotificationCard {notif} variant="center" onDismissRequest={onclose} />
					</div>
				{/each}
			</div>
		{/if}
	</aside>
{/if}
