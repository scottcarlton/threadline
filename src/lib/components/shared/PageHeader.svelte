<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		subtitle?: string;
		children?: Snippet;
	};

	let { title, subtitle, children }: Props = $props();
</script>

<div class="flex items-center justify-between gap-4">
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
