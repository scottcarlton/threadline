<script lang="ts">
	import { Select } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	type Item = { value: string; label: string; disabled?: boolean };

	type Props = {
		value?: string;
		items: Item[];
		placeholder?: string;
		class?: string;
		onValueChange?: (value: string) => void;
	};

	let {
		value = $bindable(''),
		items,
		placeholder = 'Select…',
		class: className,
		onValueChange
	}: Props = $props();

	const selectedLabel = $derived(items.find((i) => i.value === value)?.label ?? placeholder);
</script>

<Select.Root
	type="single"
	bind:value
	onValueChange={(v) => {
		if (onValueChange) onValueChange(v);
	}}
>
	<Select.Trigger
		class={cn(
			'inline-flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-input bg-background px-3.5 text-sm transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none',
			className
		)}
	>
		<span class="truncate">{selectedLabel}</span>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4 shrink-0 text-muted-foreground"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
		</svg>
	</Select.Trigger>
	<Select.Portal>
		<Select.Content
			class="animate-in fade-in-0 zoom-in-95 z-50 w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] overflow-hidden rounded-md border bg-background shadow-lg"
			sideOffset={4}
		>
			<Select.Viewport class="p-1">
				{#each items as item (item.value)}
					<Select.Item
						value={item.value}
						disabled={item.disabled}
						class="relative flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm transition-colors select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted data-[highlighted]:text-foreground data-[state=checked]:bg-muted data-[state=checked]:font-medium"
					>
						{item.label}
					</Select.Item>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>
