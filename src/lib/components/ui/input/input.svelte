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
		// No fallback. Svelte refuses `bind:value={undefined}` when the prop has
		// one, and an optional superforms field is exactly undefined until typed
		// in, so a fallback here crashed every dialog binding such a field.
		value = $bindable(),
		...restProps
	}: Props = $props();
</script>

<input
	{type}
	bind:value
	class={cn(
		'flex min-h-[44px] w-full rounded-sm border border-input bg-background px-3.5 py-2 text-base transition-colors file:border-0 file:bg-transparent file:text-base file:font-medium placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
/>
