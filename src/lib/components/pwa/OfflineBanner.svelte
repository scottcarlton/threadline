<script lang="ts">
	import { derived } from 'svelte/store';
	import { isOnline } from '$lib/stores/pwa.js';
	import { outbox } from '$lib/offline';
	import { bannerFor } from '$lib/offline/banner';
	import { foregroundIds, syncPanelOpen } from '$lib/offline/sync-ui';

	const allItems = outbox.items;
	// A form waiting on its own save speaks for it; the banner stays out of it.
	const items = derived([allItems, foregroundIds], ([rows, held]) =>
		rows.filter((i) => !held.has(i.id))
	);
	const syncState = outbox.state;
	const queueable = outbox.queueable;

	// "Everything synced" shows briefly after the queue empties while online,
	// so the rep sees their offline work land rather than it silently vanishing.
	// Only when something actually synced just now: discarding the last item
	// also empties the queue, and that is not a sync.
	let justSynced = $state(false);
	let hadUnsynced = false;
	$effect(() => {
		const unsynced = $items.some((i) => i.status !== 'synced');
		const recentSync = $items.some(
			(i) => i.status === 'synced' && Date.now() - i.updatedAt < 10_000
		);
		if (hadUnsynced && !unsynced && $isOnline && recentSync) {
			justSynced = true;
			const timer = setTimeout(() => (justSynced = false), 4000);
			hadUnsynced = false;
			return () => clearTimeout(timer);
		}
		hadUnsynced = unsynced;
	});

	const banner = $derived(
		bannerFor({
			online: $isOnline,
			items: $items,
			state: $syncState,
			canQueue: $queueable.length > 0,
			justSynced
		})
	);
</script>

{#if banner}
	<div
		role="status"
		aria-live="polite"
		class="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-sm text-muted-foreground"
	>
		{#if !$isOnline}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4 shrink-0"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<line x1="1" y1="1" x2="23" y2="23" />
				<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
				<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
				<path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
				<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
				<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
				<line x1="12" y1="20" x2="12.01" y2="20" />
			</svg>
		{/if}
		<span>{banner.text}</span>
		{#if banner.review}
			<button
				type="button"
				class="font-medium text-foreground underline decoration-transparent underline-offset-4 transition-colors duration-200 hover:decoration-current"
				onclick={() => syncPanelOpen.set(true)}
			>
				Review
			</button>
		{/if}
	</div>
{/if}
