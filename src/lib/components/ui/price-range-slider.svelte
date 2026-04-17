<script lang="ts">
	import { Slider } from 'bits-ui';

	type Props = {
		value?: [number, number];
		min?: number;
		max?: number;
		step?: number;
		onchange?: () => void;
	};

	let {
		value = $bindable<[number, number]>([0, 500]),
		min = 0,
		max = 500,
		step = 5,
		onchange
	}: Props = $props();

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});
</script>

<div class="w-60 space-y-3">
	<Slider.Root
		type="multiple"
		bind:value
		{min}
		{max}
		{step}
		onValueCommit={() => onchange?.()}
		class="relative flex h-5 w-full touch-none items-center select-none"
	>
		{#snippet children({ thumbItems })}
			<span class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
				<Slider.Range class="absolute h-full bg-foreground" />
			</span>
			{#each thumbItems as { index } (index)}
				<Slider.Thumb
					{index}
					class="block h-4 w-4 rounded-full border-2 border-foreground bg-background shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				/>
			{/each}
		{/snippet}
	</Slider.Root>
	<div class="flex items-center justify-between text-sm text-muted-foreground">
		<span>{fmt.format(value[0])}</span>
		<span>{value[1] >= max ? `${fmt.format(max)}+` : fmt.format(value[1])}</span>
	</div>
</div>
