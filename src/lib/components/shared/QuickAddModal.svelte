<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { browser } from '$app/environment';
	import {
		Dialog,
		DialogContent,
		DialogTitle,
		DialogDescription
	} from '$lib/components/ui/dialog/index.js';
	import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cart } from '$lib/stores/cart.js';
	import StockPill from '$lib/components/inventory/StockPill.svelte';
	import { aggregateStockStatus } from '$lib/utils/products';
	import QtyStepper from '$lib/components/shared/QtyStepper.svelte';

	type Variant = {
		id: string;
		color: string | null;
		size: string | null;
		stock_qty: number | null;
		stock_threshold: number | null;
		shopify_variant_id: string | null;
	};

	type Image = {
		id: string;
		file_path?: string;
		is_primary: boolean;
		sort_order: number | null;
		role?: 'primary' | 'hover' | 'video' | null;
		variant_id?: string | null;
	};

	type Product = {
		id: string;
		name: string;
		brand_id: string;
		style_number: string;
		wholesale_price: number;
		retail_price?: number | null;
		description?: string | null;
		ats?: boolean | null;
		season_id?: string | null;
		brands: { id: string; name: string } | null;
		product_variants: Variant[];
		product_images: Image[];
	};

	type Props = {
		product: Product | null;
		open: boolean;
		onOpenChange: (open: boolean) => void;
		initialImageId?: string | null;
		seasonName?: string | null;
	};

	let { product, open, onOpenChange, initialImageId = null, seasonName = null }: Props = $props();

	let isMobile = $state(false);
	$effect(() => {
		if (!browser) return;
		const mql = window.matchMedia('(max-width: 639px)');
		isMobile = mql.matches;
		const handler = (e: MediaQueryListEvent) => {
			isMobile = e.matches;
		};
		mql.addEventListener('change', handler);
		return () => mql.removeEventListener('change', handler);
	});

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

	type ImageGroup = {
		color: string;
		primary: Image | null;
		hover: Image | null;
		video: Image | null;
	};

	const variantImageGroups = $derived(() => {
		if (!product) return [];
		const variants = product.product_variants ?? [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient computation inside $derived
		const variantColorMap = new Map<string, string>();
		for (const v of variants) {
			if (v.id && v.color) variantColorMap.set(v.id, v.color);
		}
		const groups = new SvelteMap<string, ImageGroup>();
		for (const img of product.product_images ?? []) {
			const color = img.variant_id ? (variantColorMap.get(img.variant_id) ?? '') : '';
			if (!groups.has(color)) groups.set(color, { color, primary: null, hover: null, video: null });
			const group = groups.get(color)!;
			if (img.role === 'primary') group.primary = img;
			else if (img.role === 'hover') group.hover = img;
			else if (img.role === 'video') group.video = img;
			else if (img.is_primary && !group.primary) group.primary = img;
			else if (!group.hover) group.hover = img;
		}
		return [...groups.values()]
			.filter((g) => g.primary)
			.sort((a, b) => {
				const ap = a.primary?.is_primary ? 1 : 0;
				const bp = b.primary?.is_primary ? 1 : 0;
				return bp - ap;
			});
	});

	let activeGroupIndex = $state(0);

	$effect(() => {
		if (!open || !product) return;

		const hydrated: Record<string, number> = {};
		for (const item of $cart) {
			if (item.productId !== product.id) continue;
			const color = item.selectedColor ?? '';
			for (const [size, qty] of Object.entries(item.sizeQtys)) {
				if (qty > 0) hydrated[colorSizeKey(color, size)] = qty;
			}
		}
		localQtys = hydrated;

		if (initialImageId) {
			const idx = variantImageGroups().findIndex(
				(g) => g.primary?.id === initialImageId || g.hover?.id === initialImageId
			);
			activeGroupIndex = idx >= 0 ? idx : 0;
		} else {
			activeGroupIndex = 0;
		}
	});

	const activeGroup = $derived(
		variantImageGroups()[activeGroupIndex] ?? variantImageGroups()[0] ?? null
	);
	const activeImage = $derived(activeGroup?.primary ?? null);
	const selectedColor = $derived(activeGroup?.color ?? '');
	const variantThumbnails = $derived(variantImageGroups().map((g) => g.primary!));

	const isInCart = $derived(product ? $cart.some((i) => i.productId === product.id) : false);

	const stockAgg = $derived(
		product?.ats ? aggregateStockStatus(product.product_variants ?? []) : null
	);
	const isOutOfStock = $derived(product?.ats && stockAgg === 'out');

	const availableSizesForColor = $derived(() => {
		if (!product) return new Set<string>();
		const variants = product.product_variants ?? [];
		const filtered = selectedColor ? variants.filter((v) => v.color === selectedColor) : variants;
		return new Set(filtered.map((v) => v.size).filter(Boolean) as string[]);
	});

	const allSizes = $derived(
		product
			? ([...new Set(product.product_variants?.map((v) => v.size).filter(Boolean))] as string[])
			: []
	);

	const colors = $derived(
		product
			? ([...new Set(product.product_variants?.map((v) => v.color).filter(Boolean))] as string[])
			: []
	);

	let localQtys = $state<Record<string, number>>({});

	function colorSizeKey(color: string, size: string): string {
		return color ? `${color}:${size}` : size;
	}

	const activeColorQtys = $derived(() => {
		const result: Record<string, number> = {};
		for (const size of STANDARD_SIZES) {
			result[size] = localQtys[colorSizeKey(selectedColor, size)] ?? 0;
		}
		return result;
	});

	const totalUnits = $derived(Object.values(localQtys).reduce((s, q) => s + (q || 0), 0));

	const activeColorUnits = $derived(
		Object.values(activeColorQtys()).reduce((s, q) => s + (q || 0), 0)
	);

	function colorUnitsLocal(color: string): number {
		let total = 0;
		const prefix = color ? `${color}:` : '';
		for (const [key, qty] of Object.entries(localQtys)) {
			if (prefix ? key.startsWith(prefix) : !key.includes(':')) {
				total += qty || 0;
			}
		}
		return total;
	}

	function colorImageUrl(color: string): string | null {
		if (!product) return null;
		const group = variantImageGroups().find((g) => g.color === color);
		if (group?.primary) return `/api/products/${product.id}/images/${group.primary.id}`;
		const fallback =
			(product.product_images ?? []).find((i) => i.is_primary) ?? (product.product_images ?? [])[0];
		return fallback ? `/api/products/${product.id}/images/${fallback.id}` : null;
	}

	function setQty(size: string, value: number) {
		const qty = Math.max(0, Math.floor(value) || 0);
		const key = colorSizeKey(selectedColor, size);
		localQtys = { ...localQtys, [key]: qty };
	}

	function addToCart() {
		if (!product) return;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient computation inside function
		const colorsWithQtys = new Map<string, Record<string, number>>();

		for (const [key, qty] of Object.entries(localQtys)) {
			if (!qty || qty <= 0) continue;
			const sepIdx = key.indexOf(':');
			const color = sepIdx >= 0 ? key.slice(0, sepIdx) : '';
			const size = sepIdx >= 0 ? key.slice(sepIdx + 1) : key;
			if (!colorsWithQtys.has(color)) colorsWithQtys.set(color, {});
			colorsWithQtys.get(color)![size] = qty;
		}

		if (colorsWithQtys.size === 0) {
			for (const item of $cart) {
				if (item.productId === product.id) {
					cart.removeItemByKey(cart.cartKey(item));
				}
			}
			onOpenChange(false);
			return;
		}

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient computation inside function
		const existingKeys = new Set(
			$cart.filter((i) => i.productId === product.id).map((i) => cart.cartKey(i))
		);

		for (const [color, sizeQtys] of colorsWithQtys) {
			const key = cart.cartKey({ productId: product.id, selectedColor: color });
			existingKeys.delete(key);
			const existing = $cart.find((i) => cart.cartKey(i) === key);
			if (existing) {
				cart.updateItemByKey(key, { sizeQtys });
			} else {
				cart.addItem({
					productId: product.id,
					brandId: product.brand_id,
					productName: product.name,
					styleNumber: product.style_number,
					brandName: product.brands?.name ?? 'Unknown',
					price: product.wholesale_price ?? 0,
					imageUrl: colorImageUrl(color),
					colors,
					sizes: allSizes,
					addedAt: new Date().toISOString(),
					seasonId: product.season_id ?? null,
					seasonName: seasonName ?? null,
					selectedColor: color,
					sizeQtys
				});
			}
		}

		for (const staleKey of existingKeys) {
			cart.removeItemByKey(staleKey);
		}

		onOpenChange(false);
	}

	function close() {
		onOpenChange(false);
	}
</script>

{#snippet sheetBody()}
	{#if product}
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<!-- Header -->
			<div class="flex shrink-0 items-start gap-3 px-4 pt-2 pb-4">
				{#if activeImage}
					<img
						src="/api/products/{product.id}/images/{activeImage.id}"
						alt={product.name}
						class="h-20 w-20 shrink-0 rounded-md object-cover"
					/>
				{/if}
				<div class="min-w-0 flex-1">
					<p class="text-sm text-muted-foreground">{product.brands?.name ?? ''}</p>
					<p class="mt-0.5 text-sm font-semibold">{product.name}</p>
					<p class="text-sm text-muted-foreground">{product.style_number}</p>
					<p class="mt-1 text-base font-semibold">{fmt.format(product.wholesale_price ?? 0)}</p>
					{#if stockAgg}
						<div class="mt-1"><StockPill status={stockAgg} qty={null} hideQty /></div>
					{/if}
				</div>
			</div>

			<!-- Variant thumbnails -->
			{#if variantThumbnails.length > 1}
				<div class="flex flex-wrap gap-2 px-4 pb-3">
					{#each variantImageGroups() as group, i (group.primary!.id)}
						{@const cUnits = colorUnitsLocal(group.color)}
						<div class="relative">
							<button
								type="button"
								class="relative h-12 w-12 shrink-0 overflow-hidden transition-all"
								onclick={() => (activeGroupIndex = i)}
							>
								<img
									src="/api/products/{product.id}/images/{group.primary!.id}"
									alt={group.color || ''}
									class="h-full w-full object-cover"
								/>
								{#if i === activeGroupIndex}
									<span class="pointer-events-none absolute inset-0 border-[3px] border-black/70"
									></span>
								{/if}
							</button>
							{#if cUnits > 0}
								<span
									class="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-[#6BC154] px-1 text-[11px] font-semibold text-white"
									>{cUnits}</span
								>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- Size qty steppers -->
			<div class="flex-1 overflow-y-auto px-4 pb-4">
				<div class="mb-2 flex items-baseline justify-between">
					<span class="text-sm text-muted-foreground">
						Sizes{selectedColor ? ` — ${selectedColor}` : ''}
					</span>
					{#if activeColorUnits > 0}
						<span class="text-sm text-muted-foreground">
							{activeColorUnits}
							{activeColorUnits === 1 ? 'unit' : 'units'} · {fmt.format(
								activeColorUnits * (product.wholesale_price ?? 0)
							)}
						</span>
					{/if}
				</div>
				<div class="grid grid-cols-2 gap-3">
					{#each STANDARD_SIZES as size (size)}
						{@const qty = activeColorQtys()[size] ?? 0}
						{@const available = availableSizesForColor().has(size)}
						<QtyStepper
							value={qty}
							label={size}
							disabled={!available}
							onchange={(n) => setQty(size, n)}
						/>
					{/each}
				</div>
			</div>

			<!-- Footer -->
			<div
				class="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
			>
				{#if isOutOfStock}
					<Button class="w-full" disabled>Out of stock</Button>
				{:else}
					<Button class="w-full" size="lg" disabled={totalUnits === 0} onclick={addToCart}>
						{totalUnits}
						{totalUnits === 1 ? 'unit' : 'units'} — {isInCart ? 'Update Cart' : 'Add to Cart'}
					</Button>
				{/if}
			</div>
		</div>
	{/if}
{/snippet}

<!-- Mobile: spring-animated bottom sheet -->
{#if isMobile}
	<OverlayPanel
		{open}
		onclose={close}
		side="bottom"
		ariaLabel="Add {product?.name ?? 'product'} to cart"
	>
		{@render sheetBody()}
	</OverlayPanel>
{:else}
	<!-- Desktop: centered dialog -->
	<Dialog {open} {onOpenChange}>
		<DialogContent class="max-w-lg p-0">
			{#if product}
				<div class="flex flex-col">
					<div class="flex gap-4 p-5 pb-0">
						<div class="h-28 w-28 shrink-0 overflow-hidden rounded bg-muted">
							{#if activeImage}
								<img
									src="/api/products/{product.id}/images/{activeImage.id}"
									alt={product.name}
									class="h-full w-full object-cover"
								/>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm text-muted-foreground">{product.brands?.name ?? ''}</p>
							<p class="text-base font-semibold">{product.name}</p>
							<p class="text-sm text-muted-foreground">{product.style_number}</p>
							<p class="mt-1 text-base font-semibold">{fmt.format(product.wholesale_price ?? 0)}</p>
							{#if stockAgg}
								<div class="mt-1"><StockPill status={stockAgg} qty={null} hideQty /></div>
							{/if}
						</div>
					</div>

					{#if variantThumbnails.length > 1}
						<div class="flex flex-wrap gap-2 px-5 pt-4">
							{#each variantImageGroups() as group, i (group.primary!.id)}
								{@const cUnits = colorUnitsLocal(group.color)}
								<div class="relative">
									<button
										type="button"
										class="relative h-12 w-12 shrink-0 overflow-hidden transition-all"
										onclick={() => (activeGroupIndex = i)}
									>
										<img
											src="/api/products/{product.id}/images/{group.primary!.id}"
											alt={group.color || ''}
											class="h-full w-full object-cover"
										/>
										{#if i === activeGroupIndex}
											<span
												class="pointer-events-none absolute inset-0 border-[3px] border-black/70"
											></span>
										{/if}
									</button>
									{#if cUnits > 0}
										<span
											class="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-[#6BC154] px-1 text-[11px] font-semibold text-white"
											>{cUnits}</span
										>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<div class="px-5 pt-4 pb-5">
						<div class="mb-2 flex items-baseline justify-between">
							<span class="text-sm text-muted-foreground">
								Sizes{selectedColor ? ` — ${selectedColor}` : ''}
							</span>
							{#if activeColorUnits > 0}
								<span class="text-sm text-muted-foreground">
									{activeColorUnits}
									{activeColorUnits === 1 ? 'unit' : 'units'} · {fmt.format(
										activeColorUnits * (product.wholesale_price ?? 0)
									)}
								</span>
							{/if}
						</div>
						<div class="grid grid-cols-2 gap-3">
							{#each STANDARD_SIZES as size (size)}
								{@const qty = activeColorQtys()[size] ?? 0}
								{@const available = availableSizesForColor().has(size)}
								<QtyStepper
									value={qty}
									label={size}
									disabled={!available}
									onchange={(n) => setQty(size, n)}
								/>
							{/each}
						</div>
					</div>

					<div class="border-t px-5 py-4">
						{#if isOutOfStock}
							<Button class="w-full" disabled>Out of stock</Button>
						{:else}
							<Button class="w-full" size="lg" disabled={totalUnits === 0} onclick={addToCart}>
								{totalUnits}
								{totalUnits === 1 ? 'unit' : 'units'} — {isInCart ? 'Update Cart' : 'Add to Cart'}
							</Button>
						{/if}
					</div>
				</div>

				<DialogTitle class="sr-only">Add {product.name} to cart</DialogTitle>
				<DialogDescription class="sr-only"
					>Select sizes and quantities for {product.name}</DialogDescription
				>
			{/if}
		</DialogContent>
	</Dialog>
{/if}
