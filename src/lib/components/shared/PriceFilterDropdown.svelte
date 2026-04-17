<script lang="ts">
	import { Popover } from 'bits-ui';
	import PriceRangeSlider from '$lib/components/ui/price-range-slider.svelte';

	type Props = {
		value?: [number, number];
		maxPrice?: number;
		onchange?: () => void;
	};

	let { value = $bindable<[number, number]>([0, 500]), maxPrice = 500, onchange }: Props = $props();

	let open = $state(false);

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	type Preset = { label: string; min: number; max: number };
	const presets: Preset[] = [
		{ label: 'All Prices', min: 0, max: Infinity },
		{ label: 'Under $50', min: 0, max: 50 },
		{ label: '$50 – $100', min: 50, max: 100 },
		{ label: '$100 – $150', min: 100, max: 150 },
		{ label: 'Over $150', min: 150, max: Infinity }
	];

	function isPreset(p: Preset): boolean {
		return value[0] === p.min && value[1] === (p.max === Infinity ? maxPrice : p.max);
	}

	const isAllPrices = $derived(value[0] === 0 && value[1] >= maxPrice);

	const triggerLabel = $derived.by(() => {
		for (const p of presets) {
			if (isPreset(p)) return p.label;
		}
		const lo = fmt.format(value[0]);
		const hi = value[1] >= maxPrice ? `${fmt.format(maxPrice)}+` : fmt.format(value[1]);
		return `${lo} – ${hi}`;
	});

	function pickPreset(p: Preset) {
		value = [p.min, p.max === Infinity ? maxPrice : p.max];
		open = false;
		onchange?.();
	}

	function onSliderChange() {
		onchange?.();
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="inline-flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-input bg-background px-3.5 text-sm transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none {isAllPrices
			? ''
			: 'border-foreground'}"
	>
		<span class="truncate">{triggerLabel}</span>
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
	</Popover.Trigger>
	<Popover.Content
		class="animate-in fade-in-0 zoom-in-95 z-50 w-72 rounded-md border bg-background p-4 shadow-lg"
		sideOffset={4}
		align="start"
	>
		<div class="space-y-3">
			<div class="flex flex-wrap gap-1.5">
				{#each presets as p (p.label)}
					<button
						type="button"
						class="rounded-md px-2.5 py-1 text-sm transition-colors {isPreset(p)
							? 'bg-foreground text-background'
							: 'bg-muted text-muted-foreground hover:text-foreground'}"
						onclick={() => pickPreset(p)}
					>
						{p.label}
					</button>
				{/each}
			</div>
			<div class="border-t pt-3">
				<p class="mb-2 text-sm text-muted-foreground">Price Range</p>
				<PriceRangeSlider bind:value min={0} max={maxPrice} step={5} onchange={onSliderChange} />
			</div>
		</div>
	</Popover.Content>
</Popover.Root>
