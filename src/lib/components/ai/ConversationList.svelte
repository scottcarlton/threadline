<script lang="ts">
	export type ConversationSummary = { id: string; title: string | null; updated_at: string };

	let {
		conversations,
		onselect,
		onclose
	}: {
		conversations: ConversationSummary[];
		onselect: (id: string) => void;
		onclose: () => void;
	} = $props();

	function relativeTime(iso: string): string {
		const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<div class="flex items-center justify-between px-3 pb-1">
	<span class="text-sm font-medium text-zinc-500">Recent</span>
	<button
		class="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
		onclick={(e) => {
			e.stopPropagation();
			onclose();
		}}
		aria-label="Close recent conversations"
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

<div class="max-h-64 overflow-y-auto">
	{#each conversations as item (item.id)}
		<button
			class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
			onclick={(e) => {
				// The dock card sits in the click path above this list and refocuses
				// the input on any click that is not a button.
				e.stopPropagation();
				onselect(item.id);
			}}
		>
			<span class="truncate text-sm font-medium">{item.title ?? 'New conversation'}</span>
			<span class="shrink-0 text-sm text-zinc-500">{relativeTime(item.updated_at)}</span>
		</button>
	{/each}
</div>
