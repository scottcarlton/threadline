<script lang="ts">
	import { Checkbox } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	type Props = {
		checked?: boolean;
		indeterminate?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		class?: string;
		disabled?: boolean;
	};

	let {
		checked = $bindable(false),
		indeterminate = false,
		onCheckedChange,
		class: className,
		disabled = false
	}: Props = $props();
</script>

<Checkbox.Root
	bind:checked
	{disabled}
	onCheckedChange={(v) => {
		if (onCheckedChange) onCheckedChange(v === true);
	}}
	class={cn(
		'inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-muted-foreground/40 transition-colors hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
		(checked || indeterminate) && 'border-foreground bg-foreground text-background',
		className
	)}
>
	{#if indeterminate}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-[70%] w-[70%]"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="3"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
		</svg>
	{:else if checked}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-[70%] w-[70%]"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="3"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
		</svg>
	{/if}
</Checkbox.Root>
