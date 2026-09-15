<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		subtitle?: string;
		/** Rendered above the title, e.g. a back link to the parent list. */
		eyebrow?: string;
		children?: Snippet;
	};

	let { title, subtitle, eyebrow = 'System', children }: Props = $props();
</script>

<header class="mb-8 flex items-start justify-between gap-4">
	<div>
		<p class="font-mono text-sm text-muted-foreground">{eyebrow}</p>
		<h1 class="mt-1 text-3xl font-semibold">{title}</h1>
		{#if subtitle}
			<p class="mt-2 text-sm text-muted-foreground">{subtitle}</p>
		{/if}
	</div>
	{#if children}
		<div class="flex shrink-0 items-center gap-2">
			{@render children()}
		</div>
	{/if}
</header>
