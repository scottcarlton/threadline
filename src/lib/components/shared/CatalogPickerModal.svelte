<script lang="ts">
	import { untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { browser } from '$app/environment';
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
	import { aggregateStockStatus } from '$lib/utils/products';
	import type { CatalogProduct, CatalogCartItem, ProductVariant } from './catalog-picker-types.js';
	import { catalogProductToCartItem } from './catalog-picker-types.js';
	import SizeStepperSheet from './SizeStepperSheet.svelte';
	import ColorPickerSheet from './ColorPickerSheet.svelte';
	import {
		primaryImageId,
		colorPrimaryImageId,
		productColors,
		productSizes,
		itemUnits,
		itemColorCount,
		itemTotal,
		itemIsSized,
		colorUnits
	} from './catalog-picker-types.js';

	let asideEl = $state<HTMLElement | null>(null);
	let asideMounted = $state(false);
	let asideAnimating = $state(false);
	let lastSizingProductId = $state<string | null>(null);

	$effect(() => {
		if (!browser) return;
		if (sizingProductId && !asideMounted) {
			lastSizingProductId = sizingProductId;
			asideMounted = true;
			queueMicrotask(() => animateAsideIn());
		} else if (sizingProductId && asideMounted) {
			lastSizingProductId = sizingProductId;
		} else if (!sizingProductId && asideMounted && !asideAnimating) {
			animateAsideOut();
		}
	});

	async function animateAsideIn() {
		await new Promise((r) => requestAnimationFrame(r));
		await new Promise((r) => requestAnimationFrame(r));
		if (!asideEl) return;
		const { animate } = await import('motion');
		asideAnimating = true;
		await animate(asideEl, { width: '380px', opacity: 1 } as Parameters<typeof animate>[1], {
			type: 'spring',
			stiffness: 300,
			damping: 34,
			mass: 1
		}).finished?.catch(() => {});
		asideAnimating = false;
	}

	async function animateAsideOut() {
		if (!asideEl) {
			asideMounted = false;
			return;
		}
		const { animate } = await import('motion');
		asideAnimating = true;
		await animate(asideEl, { width: '0px', opacity: 0 } as Parameters<typeof animate>[1], {
			duration: 0.28,
			ease: [0.32, 0, 0.67, 0]
		}).finished?.catch(() => {});
		asideAnimating = false;
		asideMounted = false;
		lastSizingProductId = null;
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
	const hoveredImageByProduct = new Map<string, string>();

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
				const cImgMap: Record<string, string> = {};
				for (const c of items[i].available_colors) {
					const imgId = colorPrimaryImageId(product, c);
					if (imgId) cImgMap[c] = imgId;
				}
				items[i].color_image_ids = cImgMap;
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
		const hoveredImg = hoveredImageByProduct.get(p.id);
		if (hoveredImg) {
			const img = p.product_images?.find((i) => i.id === hoveredImg);
			if (img?.variant_id) {
				const v = p.product_variants.find((pv) => pv.id === img.variant_id);
				if (v?.color) {
					const item = findItem(p.id);
					if (item) item.selected_color = v.color;
				}
			}
		}
		sizingProductId = p.id;
	}

	function findItem(product_id: string): CatalogCartItem | undefined {
		return items.find((it) => it.product_id === product_id);
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

	function colorImageId(product: CatalogProduct, color: string): string | null {
		return colorPrimaryImageId(product, color);
	}

	function colorHex(product: CatalogProduct, color: string): string | null {
		return product.product_variants.find((v) => v.color === color)?.color_hex ?? null;
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
		<div class="relative flex flex-1 gap-4 overflow-hidden">
			<div class="flex-1 overflow-auto pt-5 pb-32 md:px-5">
				{#if modalLoading}
					<div class="p-10 text-center text-sm text-muted-foreground">Loading…</div>
				{:else if modalProducts.length === 0}
					<div class="p-10 text-center">
						<div class="text-base font-semibold">No products match</div>
						<p class="mt-1 text-sm text-muted-foreground">Adjust the filters above.</p>
					</div>
				{:else}
					<div class="grid grid-cols-2 gap-0 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
						{#each modalProducts as p (p.id)}
							{@const added = productInCart(p)}
							{@const locked = lockedProductIds.includes(p.id)}
							<div
								class="group/card relative flex flex-col transition {locked
									? 'pointer-events-none'
									: 'cursor-pointer'}"
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
								{#if added && !locked}
									<div
										class="pointer-events-none absolute inset-0 z-10 border-6 border-foreground/20"
									></div>
								{/if}
								{#if locked}
									<span
										class="absolute top-2 right-2 z-10 rounded-full bg-foreground px-2 py-0.5 text-sm font-medium text-background shadow-sm"
									>
										In Order
									</span>
								{/if}
								<div class="flex flex-1 flex-col {locked ? 'opacity-50' : ''}">
									<ProductImageCarousel
										productId={p.id}
										images={p.product_images ?? []}
										alt={p.name}
										aspect="aspect-square"
										activeImageId={findItem(p.id)?.image_id}
										onselect={(imageId) => {
											hoveredImageByProduct.set(p.id, imageId);
											const idx = items.findIndex((it) => it.product_id === p.id);
											if (idx >= 0) items[idx].image_id = imageId;
										}}
									>
										{#snippet overlay()}
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
													{@const cartItem = findItem(p.id)}
													{@const totalUnits = cartItem ? itemUnits(cartItem) : 0}
													{@const numColors = cartItem ? itemColorCount(cartItem) : 0}
													<button
														type="button"
														class="absolute right-4 bottom-4 left-4 inline-flex h-10 items-center justify-center rounded-md bg-background/80 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-background"
														onclick={(e) => {
															e.stopPropagation();
															openSizing(p);
														}}
													>
														{#if totalUnits > 0}
															{numColors}
															{numColors === 1 ? 'color' : 'colors'} · {totalUnits}
															{totalUnits === 1 ? 'unit' : 'units'}
														{:else}
															Set Sizes
														{/if}
													</button>
												{/if}
											{/if}
										{/snippet}
									</ProductImageCarousel>
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
			{#if asideMounted && lastSizingProductId}
				{@const it = findItem(lastSizingProductId)}
				{#if it}
					<aside
						bind:this={asideEl}
						class="mr-4 mb-4 hidden shrink-0 flex-col overflow-hidden rounded-md border bg-background sm:flex"
						style="width: 0px; opacity: 0; will-change: width, opacity;"
					>
						<div class="flex w-[380px] flex-1 flex-col">
							<div class="px-4 pt-5 pb-3">
								<button
									type="button"
									class="mb-4 flex items-center gap-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
									onclick={() => (sizingProductId = null)}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="currentColor"
										class="h-4 w-4"
										><path
											d="M5 5H13V19H5V5ZM19 19H15V5H19V19ZM4 3C3.44772 3 3 3.44772 3 4V20C3 20.5523 3.44772 21 4 21H20C20.5523 21 21 20.5523 21 20V4C21 3.44772 20.5523 3 20 3H4ZM11 12L7 8.5V15.5L11 12Z"
										></path></svg
									>
									Close
								</button>
								<div class="text-sm text-muted-foreground">{it.style_number}</div>
								<div class="text-base font-semibold">{it.name}</div>
							</div>
							<div class="flex-1 overflow-auto p-4">
								{#if it.available_colors.length > 0}
									<div class="mb-3">
										<div class="mb-2 text-sm text-muted-foreground">Color</div>
										<div class="flex flex-wrap gap-3">
											{#each it.available_colors as color (color)}
												{@const idx = items.findIndex((x) => x.product_id === it.product_id)}
												{@const prod = productForItem(it)}
												{@const thumbId = prod ? colorImageId(prod, color) : null}
												{@const hex = prod ? colorHex(prod, color) : null}
												{@const selected = it.selected_color === color}
												{@const cUnits = colorUnits(it, color)}
												<button
													type="button"
													class="flex flex-col items-center gap-1.5"
													onclick={() => (items[idx].selected_color = color)}
												>
													<div class="relative">
														{#if thumbId}
															<img
																src={`/api/products/${it.product_id}/images/${thumbId}`}
																alt={color}
																class="h-12 w-12 rounded-full object-cover ring-2 ring-offset-2 transition {selected
																	? 'ring-foreground'
																	: 'ring-transparent hover:ring-muted-foreground/40'}"
															/>
														{:else if hex}
															<span
																class="block h-12 w-12 rounded-full ring-2 ring-offset-2 transition {selected
																	? 'ring-foreground'
																	: 'ring-transparent hover:ring-muted-foreground/40'}"
																style="background-color: {hex};"
															></span>
														{:else}
															<span
																class="flex h-12 w-12 items-center justify-center rounded-full text-sm font-medium ring-2 ring-offset-2 transition {selected
																	? 'bg-foreground text-background ring-foreground'
																	: 'bg-muted text-muted-foreground ring-transparent hover:ring-muted-foreground/40'}"
															>
																{color.slice(0, 2)}
															</span>
														{/if}
														{#if cUnits > 0}
															<span
																class="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-[#6BC154] px-1 text-[11px] font-semibold text-white"
															>
																{cUnits}
															</span>
														{/if}
													</div>
													<span
														class="text-sm {selected
															? 'font-medium text-foreground'
															: 'text-muted-foreground'}">{color}</span
													>
												</button>
											{/each}
										</div>
									</div>
								{/if}

								{#if it.available_sizes.length > 0}
									{@const cUnits = colorUnits(it, it.selected_color)}
									<div class="mb-2 flex items-baseline justify-between">
										<span class="text-sm text-muted-foreground">Sizes</span>
										{#if cUnits > 0}
											<span class="text-sm text-muted-foreground"
												>{cUnits}
												{cUnits === 1 ? 'unit' : 'units'} · {fmt.format(
													cUnits * it.unit_price
												)}</span
											>
										{/if}
									</div>
									<div class="grid grid-cols-2 gap-3">
										{#each it.available_sizes as size (size)}
											{@const idx = items.findIndex((x) => x.product_id === it.product_id)}
											{@const prod = productForItem(it)}
											{@const sizeQtys = it.color_size_qtys[it.selected_color]}
											{@const qty = sizeQtys?.[size] ?? 0}
											{@const variant = prod?.ats
												? findVariant(prod, it.selected_color, size)
												: null}
											<div class="flex items-center gap-2">
												<div class="flex-1">
													<QtyStepper
														value={qty}
														label={size}
														onchange={(n) => {
															if (!items[idx].color_size_qtys[it.selected_color]) {
																items[idx].color_size_qtys[it.selected_color] = {};
															}
															items[idx].color_size_qtys[it.selected_color][size] = n;
														}}
													/>
												</div>
												{#if variant && variant.stock_qty !== null}
													<span
														class="shrink-0 rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-xs whitespace-nowrap text-emerald-600 dark:text-emerald-400"
														>{variant.stock_qty} in stock</span
													>
												{/if}
											</div>
										{/each}
									</div>
								{:else}
									{@const idx = items.findIndex((x) => x.product_id === it.product_id)}
									{@const activeColor = it.selected_color || ''}
									{@const qty = it.color_size_qtys[activeColor]?.[''] ?? 0}
									<div class="mb-2 text-sm text-muted-foreground">Qty</div>
									<QtyStepper
										value={qty}
										onchange={(n) => {
											if (!items[idx].color_size_qtys[activeColor]) {
												items[idx].color_size_qtys[activeColor] = {};
											}
											items[idx].color_size_qtys[activeColor][''] = n;
										}}
									/>
								{/if}
							</div>
						</div>
					</aside>
				{/if}
			{/if}
		</div>

		{#if items.length > 0}
			{@const unsizedCount = items.filter((i) => !itemIsSized(i)).length}
			{@const allUnits = items.reduce((s, i) => s + itemUnits(i), 0)}
			{@const allTotal = items.reduce((s, i) => s + itemTotal(i), 0)}
			<div class="pointer-events-none fixed inset-x-0 bottom-6 z-10 flex justify-center px-4">
				<div
					transition:fly={{ y: 80, duration: 320, easing: quintOut }}
					class="pointer-events-auto flex w-[420px] items-center justify-between gap-6 rounded-lg bg-foreground py-2 pr-2 pl-6 text-background shadow-lg md:w-[560px] md:py-3 md:pr-3 md:pl-8"
				>
					<div>
						<div class="text-sm">
							{items.length}
							{items.length === 1 ? 'Item' : 'Items'}
							{#if unsizedCount > 0}
								<span class="text-amber-400">
									({unsizedCount} Unsized)
								</span>
							{/if}
						</div>
						{#if allUnits > 0}
							<div class="text-sm opacity-70">
								{allUnits}
								{allUnits === 1 ? 'unit' : 'units'} ·
								<span class="font-semibold">{fmt.format(allTotal)}</span>
							</div>
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
					qtys={sheetItem ? sheetItem.color_size_qtys[sheetItem.selected_color] : undefined}
					stockBySize={sheetStockBySize}
					onChange={(size, qty) => {
						if (sheetIdx >= 0 && sheetItem) {
							const c = sheetItem.selected_color || '';
							if (!items[sheetIdx].color_size_qtys[c]) {
								items[sheetIdx].color_size_qtys[c] = {};
							}
							items[sheetIdx].color_size_qtys[c][size] = qty;
						}
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
