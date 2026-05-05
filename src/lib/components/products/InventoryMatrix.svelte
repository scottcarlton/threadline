<script lang="ts">
	type Props = {
		sizes: string[];
		skuPrefix: string;
		colorSlug?: string;
		inventory: Record<string, number | null>;
		stockThreshold: number | null;
		onInventoryChange: (inventory: Record<string, number | null>) => void;
		onThresholdChange: (threshold: number | null) => void;
	};

	let {
		sizes,
		skuPrefix,
		colorSlug,
		inventory,
		stockThreshold,
		onInventoryChange,
		onThresholdChange
	}: Props = $props();

	function buildSku(size: string): string {
		const parts = [skuPrefix];
		if (colorSlug) parts.push(colorSlug);
		parts.push(size);
		return parts.join('-').toUpperCase();
	}

	function setQty(size: string, value: string) {
		const num = value === '' ? null : parseInt(value, 10);
		onInventoryChange({ ...inventory, [size]: isNaN(num as number) ? null : num });
	}

	function setThreshold(value: string) {
		const num = value === '' ? null : parseInt(value, 10);
		onThresholdChange(isNaN(num as number) ? null : num);
	}
</script>

<div class="border border-border bg-card">
	<div
		class="grid grid-cols-[60px_1fr_100px] items-center gap-3 border-b border-border bg-muted px-3 py-1.5 font-mono text-sm text-muted-foreground"
	>
		<div>size</div>
		<div>sku</div>
		<div class="text-right">qty</div>
	</div>
	{#each sizes as size (size)}
		<div
			class="grid grid-cols-[60px_1fr_100px] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
		>
			<div class="text-sm font-medium">{size}</div>
			<div class="font-mono text-sm text-muted-foreground">{buildSku(size)}</div>
			<div>
				<input
					type="number"
					min="0"
					placeholder="0"
					value={inventory[size] ?? ''}
					oninput={(e) => setQty(size, (e.target as HTMLInputElement).value)}
					class="w-full border border-border bg-background px-2 py-1.5 text-right font-[tabular-nums] text-sm"
				/>
			</div>
		</div>
	{/each}
	<div
		class="flex items-center gap-2 border-t border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground"
	>
		<span>Low stock threshold</span>
		<input
			type="number"
			min="0"
			placeholder="0"
			value={stockThreshold ?? ''}
			oninput={(e) => setThreshold((e.target as HTMLInputElement).value)}
			class="w-[60px] border border-border bg-background px-2 py-1 text-right text-sm"
		/>
		<span>units</span>
	</div>
</div>
