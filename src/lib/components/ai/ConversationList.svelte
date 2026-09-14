<script lang="ts">
	type Summary = { id: string; title: string | null; updated_at: string };

	let { onselect }: { onselect: (id: string) => void } = $props();

	let conversations = $state<Summary[]>([]);
	let loaded = $state(false);

	export async function load() {
		const res = await fetch('/api/ai/conversations');
		if (!res.ok) return;
		const data = await res.json();
		conversations = data.conversations ?? [];
		loaded = true;
	}

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

<div
	class="absolute bottom-full left-0 mb-2 max-h-80 w-72 overflow-y-auto rounded-xl bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10"
>
	{#each conversations as item (item.id)}
		<button
			class="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
			onclick={() => onselect(item.id)}
		>
			<span class="line-clamp-1 text-sm font-medium">{item.title ?? 'New conversation'}</span>
			<span class="text-sm text-zinc-500">{relativeTime(item.updated_at)}</span>
		</button>
	{/each}
	{#if loaded && conversations.length === 0}
		<p class="px-3 py-2 text-sm text-zinc-500">No conversations yet.</p>
	{/if}
</div>
