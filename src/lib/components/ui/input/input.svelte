<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'class' | 'value'> & {
		class?: string;
		value?: string | number;
	};

	let {
		class: className = '',
		type = 'text',
		value = $bindable(''),
		...restProps
	}: Props = $props();
</script>

<input
	{type}
	bind:value
	class={cn(
		'flex min-h-[44px] w-full rounded-lg border border-input bg-background px-3.5 py-2 text-[0.875rem] shadow-sm transition-colors file:border-0 file:bg-transparent file:text-[0.875rem] file:font-medium placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
/>
