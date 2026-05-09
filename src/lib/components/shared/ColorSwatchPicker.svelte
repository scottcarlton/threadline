<script lang="ts">
	import { Popover } from 'bits-ui';
	import ColorSwatch from './ColorSwatch.svelte';

	type Props = {
		value: string | null;
		options: string[];
		disabledColors?: string[];
		onChange: (color: string | null) => void;
		triggerLabel?: string;
		disabled?: boolean;
		class?: string;
	};

	let {
		value,
		options,
		disabledColors = [],
		onChange,
		triggerLabel,
		disabled = false,
		class: klass = ''
	}: Props = $props();

	let open = $state(false);

	function pick(color: string | null) {
		if (color !== null && disabledColors.includes(color)) return;
		onChange(color);
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		disabled={disabled || options.length === 0}
		class="inline-flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1 text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60 {klass}"
	>
		<ColorSwatch color={value} size={18} />
		<span class="truncate">{triggerLabel ?? value ?? 'No color'}</span>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
		</svg>
	</Popover.Trigger>
	<Popover.Content
		class="z-50 w-64 rounded-md border bg-background p-2 shadow-lg"
		sideOffset={4}
		align="start"
	>
		<div class="grid grid-cols-5 gap-1.5">
			{#each options as color (color)}
				{@const isDisabled = disabledColors.includes(color)}
				{@const isSelected = value === color}
				<button
					type="button"
					disabled={isDisabled}
					onclick={() => pick(color)}
					class="flex flex-col items-center gap-1 rounded-md p-1 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 {isSelected
						? 'bg-muted ring-1 ring-foreground'
						: ''}"
					aria-label={color}
					aria-pressed={isSelected}
				>
					<ColorSwatch {color} size={24} />
					<span class="max-w-full truncate text-sm">{color}</span>
				</button>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
