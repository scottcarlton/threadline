<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		subtitle?: string;
		children?: Snippet;
	};

	let { title, subtitle, children }: Props = $props();
</script>

<div
	class="sticky -top-4 z-20 -mx-4 -mt-4 flex items-center justify-between gap-4 border-b border-border/50 bg-background px-4 pt-4 pb-3 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6 sm:pb-4"
>
	<div>
		<h1 class="text-3xl">{title}</h1>
		{#if subtitle}
			<p class="mt-1 text-sm text-muted-foreground">{subtitle}</p>
		{/if}
	</div>
	{#if children}
		<div class="flex items-center gap-2">
			{@render children()}
		</div>
	{/if}
</div>
