<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		class?: string;
		children: Snippet;
	};

	let { class: className = '', children }: Props = $props();
</script>

<div
	class="flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl shadow-zinc-900/10 {className}"
>
	<div class="flex items-center gap-1.5 px-4 py-3">
		<span class="h-[9px] w-[9px] rounded-full bg-zinc-300"></span>
		<span class="h-[9px] w-[9px] rounded-full bg-zinc-300"></span>
		<span class="h-[9px] w-[9px] rounded-full bg-zinc-300"></span>
	</div>
	<div class="min-h-0 flex-1">
		{@render children()}
	</div>
</div>
