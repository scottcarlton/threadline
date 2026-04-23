<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import PriceFilterDropdown from '$lib/components/shared/PriceFilterDropdown.svelte';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import StockPill from '$lib/components/inventory/StockPill.svelte';
	import { deriveStockStatus, type StockStatus } from '$lib/inventory/status';
	import type { CatalogProduct, CatalogCartItem, ProductVariant } from './catalog-picker-types.js';
	import {
		primaryImageId,
		productColors,
		productSizes,
		itemUnits,
		itemTotal,
		itemIsSized
	} from './catalog-picker-types.js';

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
		const colors = productColors(p);
		const sizes = productSizes(p);
		const size_qtys: Record<string, number> = {};
		for (const s of sizes) size_qtys[s] = 0;
		items.push({
			product_id: p.id,
			brand_id: p.brand_id,
			season_id: p.season_id,
			original_season_id: p.season_id,
			product_year: p.product_year,
			style_number: p.style_number,
			name: p.name,
			unit_price: p.wholesale_price,
			image_id: primaryImageId(p),
			available_colors: colors,
			available_sizes: sizes,
			selected_color: colors[0] ?? '',
			size_qtys
		});
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
		<div class="flex items-center justify-between border-b px-5 py-3">
			<div>
				<h2 class="text-lg font-semibold">Add Items</h2>
				<p class="text-sm text-muted-foreground">
					{items.length} added · {items.filter(itemIsSized).length} sized
				</p>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="ghost" onclick={onclose}>Cancel</Button>
				<Button onclick={handleDone}>Done</Button>
			</div>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-3 border-b px-5 py-3">
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
			{#if showBrandFilter}
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
			<div class="flex-1 overflow-auto p-5">
				{#if modalLoading}
					<div class="p-10 text-center text-sm text-muted-foreground">Loading…</div>
				{:else if modalProducts.length === 0}
					<div class="p-10 text-center">
						<div class="text-base font-semibold">No products match</div>
						<p class="mt-1 text-sm text-muted-foreground">Adjust the filters above.</p>
					</div>
				{:else}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{#each modalProducts as p (p.id)}
							{@const added = productInCart(p)}
							{@const imgId = primaryImageId(p)}
							{@const locked = lockedProductIds.includes(p.id)}
							<div
								class="relative flex flex-col rounded-lg border transition {added
									? 'border-foreground'
									: 'border-border'} {locked ? 'pointer-events-none' : ''}"
							>
								{#if locked}
									<span
										class="absolute top-2 right-2 z-10 rounded-full bg-foreground px-2 py-0.5 text-sm font-medium text-background shadow-sm"
									>
										In Order
									</span>
								{/if}
								<div class="flex flex-1 flex-col {locked ? 'opacity-50' : ''}">
									<div class="aspect-square overflow-hidden rounded-t-lg bg-muted">
										{#if imgId}
											<img
												src={`/api/products/${p.id}/images/${imgId}`}
												alt=""
												class="h-full w-full object-cover"
											/>
										{:else}
											<div class="flex h-full w-full items-center justify-center">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="1.5"
													class="h-10 w-10 text-muted-foreground/40"
												>
													<rect x="3" y="3" width="18" height="18" rx="2" />
													<circle cx="8.5" cy="8.5" r="1.5" />
													<path d="M21 15l-5-5L5 21" />
												</svg>
											</div>
										{/if}
									</div>
									<div class="flex flex-1 flex-col gap-1 p-3">
										<div class="text-sm text-muted-foreground">{p.style_number}</div>
										<div class="line-clamp-2 text-sm font-semibold">{p.name}</div>
										<div class="text-sm text-muted-foreground">
											{brandName(p.brand_id)}{p.season_id
												? ' · ' + seasonLabel(p.season_id, p.product_year)
												: ''}
										</div>
										<div class="mt-1 text-sm font-semibold">{fmt.format(p.wholesale_price)}</div>
										{#if p.ats}
											{@const agg = aggregateStockStatus(p.product_variants ?? [])}
											{#if agg}
												<div class="mt-1">
													<StockPill status={agg} qty={null} hideQty />
												</div>
											{/if}
										{/if}
										<div class="mt-auto grid grid-cols-2 gap-2 pt-3">
											{#if added}
												{#if locked}
													<Button
														size="sm"
														variant="outline"
														onclick={() => toggleProduct(p)}
														class="border-muted-foreground!"
													>
														Remove
													</Button>
												{:else}
													<button
														type="button"
														class="inline-flex h-8 items-center justify-center rounded-md border border-red-500 bg-background px-3 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
														onclick={() => toggleProduct(p)}
													>
														Remove
													</button>
												{/if}
											{:else}
												<Button size="sm" onclick={() => toggleProduct(p)}>Add</Button>
											{/if}
											<Button
												size="sm"
												variant="outline"
												disabled={!added}
												onclick={() => openSizing(p)}
												class={locked ? 'border-muted-foreground!' : ''}
											>
												Size
											</Button>
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
						class="absolute top-0 right-0 bottom-0 z-10 flex w-[380px] flex-col border-l bg-background shadow-lg transition-transform duration-200"
					>
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
								<div class="flex flex-wrap gap-3">
									{#each it.available_sizes as size (size)}
										{@const idx = items.findIndex((x) => x.product_id === it.product_id)}
										{@const prod = productForItem(it)}
										<div class="flex flex-col items-center gap-1">
											<span class="text-sm text-muted-foreground">{size}</span>
											<input
												type="number"
												min="0"
												class="h-10 w-16 rounded border bg-background px-2 text-center text-sm"
												value={it.size_qtys[size] ?? 0}
												oninput={(e) => {
													const n = parseInt((e.target as HTMLInputElement).value, 10);
													items[idx].size_qtys[size] = Number.isNaN(n) ? 0 : Math.max(0, n);
												}}
											/>
											{#if prod?.ats}
												{@const variant = findVariant(prod, it.selected_color, size)}
												{#if variant}
													{@const stat = deriveStockStatus(
														variant.stock_qty,
														variant.stock_threshold
													)}
													{#if stat}
														<StockPill status={stat} qty={variant.stock_qty} />
													{/if}
												{/if}
											{/if}
										</div>
									{/each}
								</div>
							{:else}
								{@const idx = items.findIndex((x) => x.product_id === it.product_id)}
								<div class="flex items-center gap-2">
									<span class="text-sm text-muted-foreground">Qty:</span>
									<input
										type="number"
										min="0"
										class="h-10 w-20 rounded border bg-background px-2 text-center text-sm"
										value={it.size_qtys[''] ?? 0}
										oninput={(e) => {
											const n = parseInt((e.target as HTMLInputElement).value, 10);
											items[idx].size_qtys[''] = Number.isNaN(n) ? 0 : Math.max(0, n);
										}}
									/>
								</div>
							{/if}
						</div>
						<div class="border-t p-4 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-muted-foreground">Total</span>
								<span class="font-semibold">
									{itemUnits(it)} units · {fmt.format(itemTotal(it))}
								</span>
							</div>
						</div>
					</aside>
				{/if}
			{/if}
		</div>
	</div>
{/if}
