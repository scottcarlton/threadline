<script lang="ts">
	import type { ProductVariant } from '$lib/types/database.js';
	import { deriveStockStatus } from '$lib/inventory/status';

	type Props = {
		variants: ProductVariant[];
		ats: boolean;
	};

	let { variants, ats }: Props = $props();

	type ColorGroup = {
		color: string | null;
		colorHex: string | null;
		sizes: Map<string, ProductVariant>;
	};

	const allSizes = $derived(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient computation inside $derived
		const sizeSet = new Set<string>();
		for (const v of variants) {
			if (v.size) sizeSet.add(v.size);
		}
		const letterOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
		return [...sizeSet].sort((a, b) => {
			const ai = letterOrder.indexOf(a.toUpperCase());
			const bi = letterOrder.indexOf(b.toUpperCase());
			if (ai !== -1 && bi !== -1) return ai - bi;
			if (ai !== -1) return -1;
			if (bi !== -1) return 1;
			const an = parseFloat(a);
			const bn = parseFloat(b);
			if (!isNaN(an) && !isNaN(bn)) return an - bn;
			return a.localeCompare(b);
		});
	});

	const colorGroups = $derived(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient computation inside $derived
		const map = new Map<string, ColorGroup>();
		for (const v of variants) {
			const key = v.color ?? '__none__';
			if (!map.has(key)) {
				map.set(key, { color: v.color, colorHex: v.color_hex, sizes: new Map() });
			}
			if (v.size) {
				map.get(key)!.sizes.set(v.size, v);
			}
		}
		return [...map.values()];
	});

	const totalStock = $derived(() => {
		return variants.reduce((sum, v) => sum + (v.stock_qty ?? 0), 0);
	});

	const lowCount = $derived(() => {
		return variants.filter((v) => {
			const status = deriveStockStatus(v.stock_qty, v.stock_threshold);
			return status === 'low' || status === 'out';
		}).length;
	});

	function rowTotal(group: ColorGroup): number {
		let sum = 0;
		for (const v of group.sizes.values()) {
			sum += v.stock_qty ?? 0;
		}
		return sum;
	}

	function colTotal(size: string): number {
		let sum = 0;
		for (const group of colorGroups()) {
			const v = group.sizes.get(size);
			if (v) sum += v.stock_qty ?? 0;
		}
		return sum;
	}
</script>

<div class="mt-7">
	<div class="mb-3.5 flex items-baseline justify-between">
		<div class="flex items-baseline gap-1.5">
			<h3 class="text-base font-semibold">Variants</h3>
			<span class="text-sm text-muted-foreground">({variants.length})</span>
		</div>
		{#if ats}
			<div class="flex items-center gap-3">
				<span class="text-sm font-medium">{totalStock()} in stock</span>
				{#if lowCount() > 0}
					<span
						class="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
					>
						{lowCount()} low
					</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if variants.length === 0}
		<p class="text-sm text-muted-foreground">
			No variants yet. Add a color and size run to get started.
		</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border">
						<th class="px-3 py-2.5 text-left text-sm font-normal text-muted-foreground">color</th>
						{#each allSizes() as size (size)}
							<th class="w-14 px-2 py-2.5 text-center text-sm font-normal text-muted-foreground">
								{size.toLowerCase()}
							</th>
						{/each}
						{#if ats}
							<th class="w-16 px-2 py-2.5 text-center text-sm font-medium text-foreground">total</th
							>
						{/if}
						<th class="w-9"></th>
					</tr>
				</thead>
				<tbody>
					{#each colorGroups() as group (group.color ?? '__none__')}
						<tr class="border-b border-border/50">
							<td class="px-3 py-3.5">
								<div class="flex items-center gap-2.5">
									{#if group.colorHex}
										<div
											class="h-6 w-6 shrink-0 rounded"
											style="background: {group.colorHex};"
										></div>
									{/if}
									<span class="font-medium">{group.color ?? 'Default'}</span>
								</div>
							</td>
							{#each allSizes() as size (size)}
								{@const variant = group.sizes.get(size)}
								<td class="px-2 py-3.5 text-center">
									{#if !variant}
										<span class="text-muted-foreground/40">&mdash;</span>
									{:else if ats}
										{@const status = deriveStockStatus(variant.stock_qty, variant.stock_threshold)}
										{#if status === 'out'}
											<span
												class="rounded bg-red-100 px-2 py-0.5 font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400"
											>
												0
											</span>
										{:else if status === 'low'}
											<span
												class="rounded bg-amber-100 px-2 py-0.5 font-medium dark:bg-amber-900/30"
											>
												{variant.stock_qty}
											</span>
										{:else}
											{variant.stock_qty}
										{/if}
									{:else}
										<span class="text-emerald-600">&#10003;</span>
									{/if}
								</td>
							{/each}
							{#if ats}
								<td class="px-2 py-3.5 text-center font-semibold">{rowTotal(group)}</td>
							{/if}
							<td class="px-2 py-3.5 text-center">
								<button class="text-muted-foreground transition-colors hover:text-foreground"
									>&middot;&middot;&middot;</button
								>
							</td>
						</tr>
					{/each}
				</tbody>
				{#if ats}
					<tfoot>
						<tr class="border-t border-border">
							<td class="px-3 py-3 text-sm text-muted-foreground">total per size</td>
							{#each allSizes() as size (size)}
								<td class="px-2 py-3 text-center text-muted-foreground">{colTotal(size)}</td>
							{/each}
							<td class="px-2 py-3 text-center font-bold">{totalStock()}</td>
							<td></td>
						</tr>
					</tfoot>
				{/if}
			</table>
		</div>
	{/if}
</div>
