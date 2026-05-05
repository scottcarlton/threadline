<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { resolve } from '$app/paths';
	import { fly } from 'svelte/transition';

	type Props = {
		href: string;
		label?: string;
		class?: string;
	};

	let { href, label = 'Back', class: className }: Props = $props();
</script>

<a
	href={resolve(href as '/orders')}
	class={cn(
		'inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
		className
	)}
	in:fly={{ x: -8, duration: 200, delay: 50 }}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="h-4 w-4"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="2"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
	</svg>
	{label}
</a>
