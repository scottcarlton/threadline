<script lang="ts">
	import { untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import { expoOut, quintOut } from 'svelte/easing';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import PriceFilterDropdown from '$lib/components/shared/PriceFilterDropdown.svelte';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import StockPill from '$lib/components/inventory/StockPill.svelte';
	import ProductImageCarousel from '$lib/components/shared/ProductImageCarousel.svelte';
	import QtyStepper from '$lib/components/shared/QtyStepper.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { deriveStockStatus, type StockStatus } from '$lib/inventory/status';
	import type { CatalogProduct, CatalogCartItem, ProductVariant } from './catalog-picker-types.js';
	import { catalogProductToCartItem } from './catalog-picker-types.js';
	import SizeStepperSheet from './SizeStepperSheet.svelte';
	import ColorPickerSheet from './ColorPickerSheet.svelte';
	import {
		primaryImageId,
		productColors,
		productSizes,
		itemUnits,
		itemTotal,
		itemIsSized
	} from './catalog-picker-types.js';

	function asidePush(_node: Element, { width = 380, duration = 700 } = {}) {
		return {
			duration,
			easing: expoOut,
			css: (t: number) => `width: ${width * t}px; opacity: ${t};`
		};
	}

	type Props = {
		open: boolean;
		items: CatalogCartItem[];
		brandIds: string[];
		brands: { id: string; name: string }[];
		seasons: { id: string; name: string }[];
		showBrandFilter?: boolean;
		/** Product IDs rendered dimmed + non-interactive ("already in order"). */
		lockedProductIds?: string[];
		onclose: () => void;
		ondone: (items: CatalogCartItem[]) => void;
	};

	let {
		open = $bindable(),
		items = $bindable(),
		brandIds,
		brands,
		seasons,
		showBrandFilter = false,
		lockedProductIds = [],
		onclose,
		ondone
	}: Props = $props();

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// ── Modal state ──────────────────────────────────────────────────────────
	let modalSearch = $state('');
	let modalSeason = $state('');
	let modalBrand = $state('');
	let modalPriceRange = $state<[number, number]>([0, 500]);
	let modalAtsOnly = $state(false);
	let modalProducts = $state<CatalogProduct[]>([]);
	let modalLoading = $state(false);
	let modalDebounce: ReturnType<typeof setTimeout> | undefined;
	let sizingProductId = $state<string | null>(null);
	let colorPickerProductId = $state<string | null>(null);

	// Deduplicated seasons for dropdown display
	const dedupedSeasons = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation inside $derived
		const seen = new Set<string>();
		return seasons.filter((s) => {
			const key = s.name.trim().toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	});

	// ── Load products ────────────────────────────────────────────────────────
	async function loadModalProducts() {
		modalLoading = true;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams();
		if (modalSearch) params.set('q', modalSearch);
		const effectiveBrandIds = modalBrand
			? brands.filter((b) => b.name === modalBrand).map((b) => b.id)
			: brandIds;
		for (const b of effectiveBrandIds) params.append('brand_id', b);
		if (modalSeason) {
			const key = modalSeason.trim().toLowerCase();
			for (const s of seasons) {
				if (s.name.trim().toLowerCase() === key) params.append('season_id', s.id);
			}
		}
		if (modalPriceRange[0] > 0) params.set('min_price', String(modalPriceRange[0]));
		if (modalPriceRange[1] < 500) params.set('max_price', String(modalPriceRange[1]));
		if (modalAtsOnly) params.set('ats', 'true');
		params.set('limit', '200');
		try {
			const res = await fetch(`/api/products?${params.toString()}`);
			const json = await res.json();
			modalProducts = (json.products ?? []) as CatalogProduct[];
		} finally {
			modalLoading = false;
		}
	}

	function onModalSearchChange() {
		clearTimeout(modalDebounce);
		modalDebounce = setTimeout(loadModalProducts, 250);
	}

	// ── Open/reset on visibility change ──────────────────────────────────────
	// Track only `open`; the resets and loadModalProducts() read the same state
	// they write, which would otherwise create an infinite effect loop.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			modalSearch = '';
			modalSeason = '';
			modalBrand = '';
			modalPriceRange = [0, 500];
			modalAtsOnly = false;
			sizingProductId = null;
			loadModalProducts();
		});
	});

	// Enrich pre-populated cart items with product data once loaded.
	// Only track `modalProducts`; the writes below target the same reactive
	// state the loop reads (items[i].available_colors, etc.), so tracking both
	// sides would create an infinite effect loop.
	$effect(() => {
		if (modalProducts.length === 0) return;
		untrack(() => {
			for (let i = 0; i < items.length; i++) {
				const product = modalProducts.find((p) => p.id === items[i].product_id);
				if (!product) continue;
				if (items[i].available_colors.length === 0) {
					items[i].available_colors = productColors(product);
				}
				if (items[i].available_sizes.length === 0) {
					items[i].available_sizes = productSizes(product);
				}
				if (!items[i].image_id) {
					items[i].image_id = primaryImageId(product);
				}
			}
		});
	});

	// ── Helpers ──────────────────────────────────────────────────────────────
	function brandName(id: string): string {
		return brands.find((b) => b.id === id)?.name ?? 'Brand';
	}
	function seasonName(id: string | null): string {
		if (!id) return 'No season';
		return seasons.find((s) => s.id === id)?.name ?? 'Season';
	}
	function seasonLabel(id: string | null, year: number | null | undefined): string {
		const name = seasonName(id);
		if (!id) return year ? `${name} · ${year}` : name;
		return year ? `${name} ${year}` : name;
	}

	function productInCart(p: CatalogProduct): boolean {
		return items.some((it) => it.product_id === p.id);
	}

	function addProduct(p: CatalogProduct) {
		if (productInCart(p)) return;
		items.push(catalogProductToCartItem(p));
	}

	function removeProduct(product_id: string) {
		const i = items.findIndex((it) => it.product_id === product_id);
		if (i >= 0) items.splice(i, 1);
		if (sizingProductId === product_id) sizingProductId = null;
	}

	function toggleProduct(p: CatalogProduct) {
		if (productInCart(p)) removeProduct(p.id);
		else addProduct(p);
	}

	function openSizing(p: CatalogProduct) {
		if (!productInCart(p)) addProduct(p);
		sizingProductId = p.id;
	}

	function findItem(product_id: string): CatalogCartItem | undefined {
		return items.find((it) => it.product_id === product_id);
	}

	function variantSummary(p: CatalogProduct): string {
		const colors = productColors(p).length;
		const sizes = productSizes(p).length;
		const parts: string[] = [];
		if (colors > 0) parts.push(`${colors} color${colors > 1 ? 's' : ''}`);
		if (sizes > 0) parts.push(`${sizes} size${sizes > 1 ? 's' : ''}`);
		return parts.join(', ') || 'No variants';
	}

	function aggregateStockStatus(
		variants: { stock_qty: number | null; stock_threshold: number | null }[]
	): StockStatus | null {
		const statuses = variants
			.map((v) => deriveStockStatus(v.stock_qty, v.stock_threshold))
			.filter((s): s is StockStatus => s !== null);
		if (statuses.length === 0) return null;
		if (statuses.includes('out')) return 'out';
		if (statuses.includes('low')) return 'low';
		return 'in';
	}

	function findVariant(
		product: CatalogProduct,
		color: string | null,
		size: string | null
	): ProductVariant | null {
		return (
			product.product_variants.find(
				(v) => (v.color ?? null) === (color ?? null) && (v.size ?? null) === (size ?? null)
			) ?? null
		);
	}

	function productForItem(it: CatalogCartItem): CatalogProduct | null {
		return modalProducts.find((p) => p.id === it.product_id) ?? null;
	}

	function handleDone() {
		ondone(items);
		onclose();
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true">
		<!-- Top bar -->
		<div class="flex items-center justify-between px-5 py-3">
			<h2 class="text-lg font-semibold">Add Items</h2>
			<div class="flex items-center gap-2">
				<Button variant="ghost" onclick={onclose}>Cancel</Button>
			</div>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-3 px-5 py-3">
			<SearchInput
				placeholder="Search style # or name…"
				bind:value={modalSearch}
				oninput={onModalSearchChange}
				class="w-64"
			/>
			{#if dedupedSeasons.length > 1}
				<SelectField
					value={modalSeason}
					items={[
						{ value: '', label: 'All seasons' },
						...dedupedSeasons.map((s) => ({ value: s.name, label: s.name }))
					]}
					placeholder="All seasons"
					onValueChange={(v) => {
						modalSeason = v;
						loadModalProducts();
					}}
				/>
			{/if}
			{#if showBrandFilter && brands.length > 1}
				<SelectField
					value={modalBrand}
					items={[
						{ value: '', label: 'All brands' },
						...brands.map((b) => ({ value: b.name, label: b.name }))
					]}
					placeholder="All brands"
					onValueChange={(v) => {
						modalBrand = v;
						loadModalProducts();
					}}
				/>
			{/if}
			<PriceFilterDropdown
				bind:value={modalPriceRange}
				maxPrice={500}
				onchange={loadModalProducts}
			/>
			<label class="ml-auto flex h-10 items-center gap-2 text-sm" for="catalog-ats-only">
				ATS Only
				<Switch
					id="catalog-ats-only"
					bind:checked={modalAtsOnly}
					onCheckedChange={loadModalProducts}
					aria-label="ATS Only"
				/>
			</label>
		</div>

		<!-- Body: grid + overlay sizing panel -->
		<div class="relative flex flex-1 overflow-hidden">
			<div class="flex-1 overflow-auto p-5 pb-32">
				{#if modalLoading}
					<div class="p-10 text-center text-sm text-muted-foreground">Loading…</div>
				{:else if modalProducts.length === 0}
					<div class="p-10 text-center">
						<div class="text-base font-semibold">No products match</div>
						<p class="mt-1 text-sm text-muted-foreground">Adjust the filters above.</p>
					</div>
				{:else}
					<div class="grid grid-cols-2 gap-1 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
						{#each modalProducts as p (p.id)}
							{@const added = productInCart(p)}
							{@const locked = lockedProductIds.includes(p.id)}
							<div
								class="group/card relative flex flex-col border transition {added
									? 'border-foreground'
									: 'border-border'} {locked ? 'pointer-events-none' : 'cursor-pointer'}"
								role="button"
								tabindex={locked ? -1 : 0}
								aria-pressed={added}
								onclick={() => {
									if (!locked) toggleProduct(p);
								}}
								onkeydown={(e) => {
									if (locked) return;
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										toggleProduct(p);
									}
								}}
							>
								{#if locked}
									<span
										class="absolute top-2 right-2 z-10 rounded-full bg-foreground px-2 py-0.5 text-sm font-medium text-background shadow-sm"
									>
										In Order
									</span>
								{/if}
								<div class="flex flex-1 flex-col {locked ? 'opacity-50' : ''}">
									<div class="relative">
										<ProductImageCarousel
											productId={p.id}
											images={p.product_images ?? []}
											alt={p.name}
											aspect="aspect-square"
											onselect={(imageId) => {
												const idx = items.findIndex((it) => it.product_id === p.id);
												if (idx >= 0) items[idx].image_id = imageId;
											}}
										/>
										{#if p.ats}
											{@const agg = aggregateStockStatus(p.product_variants ?? [])}
											{#if agg}
												<div
													class="absolute top-4 left-4 flex rounded-full bg-white shadow-sm dark:bg-black"
												>
													<StockPill status={agg} qty={null} hideQty />
												</div>
											{/if}
										{/if}
										{#if !locked}
											<div
												class="absolute top-2 right-2 p-2 transition-opacity [@media(hover:none)]:opacity-100 {added
													? 'opacity-100'
													: 'opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100'}"
											>
												<span class="pointer-events-none flex rounded-sm bg-white">
													<Checkbox
														checked={added}
														class="h-6 w-6 group-hover/card:border-foreground"
													/>
												</span>
											</div>
											{#if added}
												<button
													type="button"
													class="absolute right-4 bottom-14 left-4 inline-flex h-10 items-center justify-center rounded-md border bg-background text-sm font-medium transition-colors hover:bg-muted"
													onclick={(e) => {
														e.stopPropagation();
														openSizing(p);
													}}
												>
													Set Sizes
												</button>
											{/if}
										{/if}
									</div>
									<div class="flex flex-1 flex-col gap-1 p-3">
										<div class="text-sm text-muted-foreground">{p.style_number}</div>
										<div
											class="mt-0.5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
										>
											<div class="min-w-0">
												<div class="text-sm font-semibold">{p.name}</div>
												<div class="text-sm text-muted-foreground">
													{brandName(p.brand_id)}{p.season_id
														? ' · ' + seasonLabel(p.season_id, p.product_year)
														: ''}
												</div>
											</div>
											<div class="shrink-0 sm:text-right">
												<div class="text-sm font-semibold">{fmt.format(p.wholesale_price)}</div>
												<div class="mt-0.5 text-sm text-muted-foreground">{variantSummary(p)}</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Sizing panel (overlay) -->
			{#if sizingProductId}
				{@const it = findItem(sizingProductId)}
				{#if it}
					<aside
						transition:asidePush={{ width: 380, duration: 700 }}
						class="hidden shrink-0 flex-col overflow-hidden bg-background sm:flex"
					>
						<div class="flex w-[380px] flex-1 flex-col">
							<div class="px-4 pt-5 pb-3">
								<button
									type="button"
									class="mb-4 flex items-center gap-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
									onclick={() => (sizingProductId = null)}
								>
									<LongArrow direction="left" class="h-4 w-4" />
									Back to products
								</button>
								<div class="text-sm text-muted-foreground">{it.style_number}</div>
								<div class="text-base font-semibold">{it.name}</div>
							</div>
							<div class="flex-1 overflow-auto p-4">
								{#if it.available_colors.length > 0}
									<div class="mb-3">
										<div class="mb-2 text-sm text-muted-foreground">Color</div>
										<div class="flex flex-wrap gap-2">
											{#each it.available_colors as color (color)}
												{@const idx = items.findIndex((x) => x.product_id === it.product_id)}
												<button
													type="button"
													class="rounded-full px-3 py-1 text-sm font-medium transition {it.selected_color ===
													color
														? 'bg-foreground text-background'
														: 'bg-muted text-muted-foreground hover:text-foreground'}"
													onclick={() => (items[idx].selected_color = color)}
												>
													{color}
												</button>
											{/each}
										</div>
									</div>
								{/if}

								{#if it.available_sizes.length > 0}
									<div class="mb-2 text-sm text-muted-foreground">Sizes</div>
									<div class="flex flex-col gap-3">
										{#each it.available_sizes as size (size)}
											{@const idx = items.findIndex((x) => x.product_id === it.product_id)}
											{@const prod = productForItem(it)}
											{@const qty = it.size_qtys[size] ?? 0}
											{@const variant = prod?.ats
												? findVariant(prod, it.selected_color, size)
												: null}
											<div
												class="grid items-center gap-3"
												style="grid-template-columns: 32px 2fr 1fr;"
											>
												<span class="text-sm font-medium">{size}</span>
												<QtyStepper
													value={qty}
													label={size}
													onchange={(n) => {
														items[idx].size_qtys[size] = n;
													}}
												/>
												{#if variant && variant.stock_qty !== null}
													<span
														class="w-fit rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-xs whitespace-nowrap text-emerald-600 dark:text-emerald-400"
														>{variant.stock_qty} in stock</span
													>
												{/if}
											</div>
										{/each}
									</div>
								{:else}
									{@const idx = items.findIndex((x) => x.product_id === it.product_id)}
									{@const qty = it.size_qtys[''] ?? 0}
									<div class="mb-2 text-sm text-muted-foreground">Qty</div>
									<QtyStepper
										value={qty}
										onchange={(n) => {
											items[idx].size_qtys[''] = n;
										}}
									/>
								{/if}
							</div>
							<div class="p-4 text-sm">
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground">Total</span>
									<span class="font-semibold">
										{itemUnits(it)} units · {fmt.format(itemTotal(it))}
									</span>
								</div>
							</div>
						</div>
					</aside>
				{/if}
			{/if}
		</div>

		{#if items.length > 0}
			{@const unsizedCount = items.filter((i) => !itemIsSized(i)).length}
			<div class="pointer-events-none fixed inset-x-0 bottom-6 z-10 flex justify-center px-4">
				<div
					transition:fly={{ y: 80, duration: 320, easing: quintOut }}
					class="pointer-events-auto flex w-[420px] items-center justify-between gap-6 rounded-lg bg-foreground py-2 pr-2 pl-6 text-background shadow-lg md:w-[560px] md:py-3 md:pr-3 md:pl-8"
				>
					<div class="text-sm">
						{items.length}
						{items.length === 1 ? 'Item' : 'Items'}
						{#if unsizedCount > 0}
							<span class="text-amber-400">
								({unsizedCount} Unsized)
							</span>
						{/if}
					</div>
					<button
						type="button"
						class="inline-flex h-10 items-center rounded-md bg-background px-8 text-sm font-medium text-foreground transition-colors hover:bg-background/90 md:h-12 md:px-12 md:text-base"
						onclick={handleDone}
					>
						Done
					</button>
				</div>
			</div>
		{/if}

		{#if true}
			{@const sheetItem = sizingProductId ? findItem(sizingProductId) : undefined}
			{@const sheetIdx = sheetItem
				? items.findIndex((x) => x.product_id === sheetItem.product_id)
				: -1}
			{@const sheetProd = sheetItem ? productForItem(sheetItem) : null}
			{@const sheetImg = sheetProd ? primaryImageId(sheetProd) : null}
			{@const sheetStockBySize = (() => {
				if (!sheetProd?.ats || !sheetItem) return undefined;
				const map: Record<string, number | null> = {};
				for (const size of sheetItem.available_sizes) {
					const v = findVariant(sheetProd, sheetItem.selected_color, size);
					map[size] = v?.stock_qty ?? null;
				}
				return map;
			})()}
			<div class="sm:hidden">
				<SizeStepperSheet
					open={!!sheetItem}
					onClose={() => (sizingProductId = null)}
					styleNumber={sheetItem?.style_number}
					name={sheetItem?.name}
					brand={sheetItem ? brandName(sheetItem.brand_id) : null}
					season={sheetItem?.season_id
						? seasonLabel(sheetItem.season_id, sheetItem.product_year)
						: null}
					color={sheetItem?.selected_color || null}
					imageUrl={sheetItem && sheetImg
						? `/api/products/${sheetItem.product_id}/images/${sheetImg}`
						: null}
					unitPrice={sheetItem?.unit_price}
					sizes={sheetItem?.available_sizes}
					qtys={sheetItem?.size_qtys}
					stockBySize={sheetStockBySize}
					onChange={(size, qty) => {
						if (sheetIdx >= 0) items[sheetIdx].size_qtys[size] = qty;
					}}
					onColorPickerOpen={() => {
						const id = sheetItem?.product_id ?? null;
						sizingProductId = null;
						if (id) colorPickerProductId = id;
					}}
				/>
			</div>
			{@const colorItem = colorPickerProductId ? findItem(colorPickerProductId) : undefined}
			{@const colorIdx = colorItem
				? items.findIndex((x) => x.product_id === colorItem.product_id)
				: -1}
			{@const colorProd = colorItem ? productForItem(colorItem) : null}
			{@const colorImg = colorProd ? primaryImageId(colorProd) : null}
			<div class="sm:hidden">
				<ColorPickerSheet
					open={!!colorItem}
					onClose={() => (colorPickerProductId = null)}
					styleNumber={colorItem?.style_number}
					name={colorItem?.name}
					brand={colorItem ? brandName(colorItem.brand_id) : null}
					season={colorItem?.season_id
						? seasonLabel(colorItem.season_id, colorItem.product_year)
						: null}
					imageUrl={colorItem && colorImg
						? `/api/products/${colorItem.product_id}/images/${colorImg}`
						: null}
					colors={colorItem?.available_colors}
					selected={colorItem?.selected_color || null}
					onSelect={(c) => {
						if (colorIdx >= 0) items[colorIdx].selected_color = c;
					}}
				/>
			</div>
		{/if}
	</div>
{/if}
