<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'class' | 'value' | 'type'> & {
		class?: string;
		value?: string;
	};

	let { class: className = '', value = $bindable(''), ...restProps }: Props = $props();
</script>

<div class={cn('relative', className)}>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="2"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
		/>
	</svg>
	<input
		type="text"
		bind:value
		class="flex min-h-[44px] w-full rounded-lg border border-input bg-background py-2 pr-3.5 pl-9 text-[0.875rem] transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		{...restProps}
	/>
</div>
