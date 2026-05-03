<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import PriceFilterDropdown from '$lib/components/shared/PriceFilterDropdown.svelte';
	import SeasonFilter from '$lib/components/shared/SeasonFilter.svelte';
	import CategoryFilter from '$lib/components/shared/CategoryFilter.svelte';
	import { seasonIdsByName } from '$lib/utils/seasons.js';
	import { cart } from '$lib/stores/cart.js';
	import type { Product } from '$lib/types/database.js';
	import StockPill from '$lib/components/inventory/StockPill.svelte';
	import ProductImageCarousel from '$lib/components/shared/ProductImageCarousel.svelte';
	import { deriveStockStatus, type StockStatus } from '$lib/inventory/status';

	let { data } = $props();

	const brands = $derived(data.brands as { id: string; name: string; logo_url: string | null }[]);
	const seasons = $derived((data.seasons ?? []) as Array<{ id: string; name: string }>);
	const products = $derived(
		data.products as (Product & {
			brands: { id: string; name: string } | null;
			product_variants: {
				id: string;
				color: string | null;
				size: string | null;
				stock_qty: number | null;
				stock_threshold: number | null;
				shopify_variant_id: string | null;
			}[];
			product_images: {
				id: string;
				file_path: string;
				is_primary: boolean;
				sort_order: number | null;
			}[];
		})[]
	);

	let search = $state('');
	let seasonFilter = $state('');
	let categoryFilter = $state('');
	let priceRange = $state<[number, number]>([0, 500]);
	const brandFilter = $derived($page.url.searchParams.get('brand') ?? '');

	// Categories list derives from current product set so the dropdown only
	// shows values that can actually match.
	const categories = $derived(
		[...new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort()
	);
	const maxProductPrice = $derived(
		Math.max(...products.map((p) => Number(p.wholesale_price) || 0), 500)
	);
	$effect(() => {
		// Reset the upper bound when the product set or its max changes.
		if (priceRange[1] === 500 && maxProductPrice !== 500) {
			priceRange = [priceRange[0], maxProductPrice];
		}
	});

	function setBrandFilter(brandId: string) {
		const url = new URL($page.url);
		if (brandId) {
			url.searchParams.set('brand', brandId);
		} else {
			url.searchParams.delete('brand');
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-page URL rebuild
		goto(`${resolve('/shop')}${url.search}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
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

	const selectedSeasonIds = $derived(
		seasonFilter ? new Set(seasonIdsByName(seasons, seasonFilter)) : null
	);
	const filtered = $derived(
		products.filter((p) => {
			const matchesBrand = !brandFilter || p.brand_id === brandFilter;
			const matchesSeason =
				!selectedSeasonIds || (p.season_id && selectedSeasonIds.has(p.season_id));
			const matchesCategory = !categoryFilter || p.category === categoryFilter;
			const price = Number(p.wholesale_price) || 0;
			const matchesPrice = price >= priceRange[0] && price <= priceRange[1];
			const matchesSearch =
				!search ||
				p.name.toLowerCase().includes(search.toLowerCase()) ||
				p.style_number.toLowerCase().includes(search.toLowerCase()) ||
				(p.category?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
				(p.brands?.name.toLowerCase().includes(search.toLowerCase()) ?? false);
			if (!matchesBrand || !matchesSeason || !matchesCategory || !matchesPrice || !matchesSearch)
				return false;
			if (p.ats) {
				const agg = aggregateStockStatus(p.product_variants ?? []);
				if (agg === 'out') return false;
			}
			return true;
		})
	);

	const activeBrandName = $derived(brands.find((b) => b.id === brandFilter)?.name ?? '');
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	function getVariantSummary(variants: { color: string | null; size: string | null }[]): string {
		const colors = new Set(variants.map((v) => v.color).filter(Boolean));
		const sizes = new Set(variants.map((v) => v.size).filter(Boolean));
		const parts: string[] = [];
		if (colors.size > 0) parts.push(`${colors.size} color${colors.size > 1 ? 's' : ''}`);
		if (sizes.size > 0) parts.push(`${sizes.size} size${sizes.size > 1 ? 's' : ''}`);
		return parts.join(', ') || 'No variants';
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl">Shop</h1>
		{#if brands.length > 0}
			<p class="mt-1 text-sm text-muted-foreground">
				{filtered.length} product{filtered.length !== 1 ? 's' : ''}{activeBrandName
					? ` from ${activeBrandName}`
					: ''}
			</p>
		{/if}
	</div>

	{#if brands.length === 0}
		<div class="rounded-none p-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mx-auto h-16 w-16 text-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="0.4"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">No brands available</p>
			<p class="mt-2 text-sm text-muted-foreground">
				You currently do not have access to any brand items. Contact your sales rep for access.
			</p>
		</div>
	{:else}
		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-3">
			<div class="max-w-xs flex-1">
				<SearchInput placeholder="Search products..." bind:value={search} />
			</div>
			{#if brands.length > 1}
				<div class="flex flex-wrap gap-1.5">
					<button
						class="rounded-lg border px-3 py-1.5 text-sm transition-colors {!brandFilter
							? 'border-primary bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:border-foreground/20 hover:text-foreground'}"
						onclick={() => setBrandFilter('')}
					>
						All Brands
					</button>
					{#each brands as brand (brand.id)}
						<button
							class="rounded-lg border px-3 py-1.5 text-sm transition-colors {brandFilter ===
							brand.id
								? 'border-primary bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:border-foreground/20 hover:text-foreground'}"
							onclick={() => setBrandFilter(brand.id)}
						>
							{brand.name}
						</button>
					{/each}
				</div>
			{/if}
			{#if seasons.length > 0}
				<SeasonFilter {seasons} value={seasonFilter} onValueChange={(v) => (seasonFilter = v)} />
			{/if}
			{#if categories.length > 0}
				<CategoryFilter
					{categories}
					value={categoryFilter}
					onValueChange={(v) => (categoryFilter = v)}
				/>
			{/if}
			<PriceFilterDropdown bind:value={priceRange} maxPrice={maxProductPrice} />
		</div>

		<!-- Product grid -->
		{#if filtered.length === 0}
			<div class="rounded-none p-12 text-center">
				{#if search || brandFilter}
					<p class="text-lg font-semibold">No products match your search</p>
					<p class="mt-2 text-sm text-muted-foreground">Try adjusting your filters</p>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mx-auto h-16 w-16 text-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="0.4"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
						/>
					</svg>
					<p class="mt-4 text-lg font-semibold">No products available yet</p>
					<p class="mt-2 text-sm text-muted-foreground">
						Products will appear here once your brands add them
					</p>
				{/if}
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-1 sm:gap-4 lg:grid-cols-3">
				{#each filtered as product (product.id)}
					{@const primaryImage =
						product.product_images?.find((i) => i.is_primary) ?? product.product_images?.[0]}
					{@const inCart = $cart.some((i) => i.productId === product.id)}
					{@const seasonRow = seasons.find((s) => s.id === product.season_id)}
					<div
						class="group rounded-none border bg-card transition-all duration-200 hover:border-foreground/20 hover:shadow-md"
					>
						<a href={resolve(`/shop/${product.id}`)} class="block">
							<div class="relative">
								<ProductImageCarousel
									productId={product.id}
									images={product.product_images ?? []}
									alt={product.name}
								/>
								{#if product.ats}
									{@const stockAgg = aggregateStockStatus(product.product_variants ?? [])}
									{#if stockAgg}
										<div
											class="absolute top-4 left-4 flex rounded-full bg-white shadow-sm dark:bg-black"
										>
											<StockPill status={stockAgg} qty={null} hideQty />
										</div>
									{/if}
								{/if}
							</div>
							<div class="p-4">
								<p class="text-sm text-muted-foreground">{product.style_number}</p>
								<div
									class="mt-0.5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
								>
									<div class="min-w-0">
										<p class="text-sm font-medium">{product.name}</p>
										<p class="mt-0.5 text-sm text-muted-foreground">
											{[product.brands?.name, seasonRow?.name].filter(Boolean).join(' · ')}
										</p>
									</div>
									<div class="shrink-0 sm:text-right">
										<p class="text-sm font-medium">{fmt.format(Number(product.wholesale_price))}</p>
										<p class="mt-0.5 text-sm text-muted-foreground">
											{getVariantSummary(product.product_variants ?? [])}
										</p>
									</div>
								</div>
							</div>
						</a>
						<div class="px-4 pb-4">
							{#if inCart}
								<button
									onclick={() => cart.removeItem(product.id)}
									class="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3.5 w-3.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
									In Cart
								</button>
							{:else}
								<button
									onclick={() =>
										cart.addItem({
											productId: product.id,
											brandId: product.brand_id,
											productName: product.name,
											styleNumber: product.style_number,
											brandName: product.brands?.name ?? 'Unknown',
											price: Number(product.wholesale_price ?? 0),
											imageUrl: primaryImage
												? `/api/products/${product.id}/images/${primaryImage.id}`
												: null,
											colors: [
												...new Set(
													(product.product_variants ?? [])
														.map((v) => v.color)
														.filter((c): c is string => Boolean(c))
												)
											],
											sizes: [
												...new Set(
													(product.product_variants ?? [])
														.map((v) => v.size)
														.filter((s): s is string => Boolean(s))
												)
											],
											addedAt: new Date().toISOString(),
											seasonId: product.season_id ?? null,
											seasonName: seasonRow?.name ?? null,
											selectedColor:
												(product.product_variants ?? [])
													.map((v) => v.color)
													.filter((c): c is string => Boolean(c))[0] ?? '',
											sizeQtys: {}
										})}
									class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3.5 w-3.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M12 4.5v15m7.5-7.5h-15"
										/>
									</svg>
									Add to Cart
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
