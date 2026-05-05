<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import PriceFilterDropdown from '$lib/components/shared/PriceFilterDropdown.svelte';
	import ProductImportModal from '$lib/components/products/ProductImportModal.svelte';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import StockPill from '$lib/components/inventory/StockPill.svelte';
	import ProductCard from '$lib/components/products/ProductCard.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import SeasonFilter from '$lib/components/shared/SeasonFilter.svelte';
	import BrandFilter from '$lib/components/shared/BrandFilter.svelte';
	import CategoryFilter from '$lib/components/shared/CategoryFilter.svelte';
	import { seasonIdsByName } from '$lib/utils/seasons.js';
	import { aggregateStockStatus } from '$lib/utils/products';
	import type { Product } from '$lib/types/database.js';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { debounce } from '$lib/utils/debounce.js';
	import { selectedProductIds } from '$lib/stores/productSelection.js';

	const PAGE_SIZE = 50;

	type ProductRow = Product & {
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
			role: 'primary' | 'hover' | null;
			variant_id: string | null;
		}[];
	};

	let { data } = $props();
	// Single-brand mode: data.brand is the org's self-brand. Multi-brand mode
	// (Nx-BLSR — sales-role member of 2+ brand-orgs): data.brand is null and
	// data.brands is the union. Product cards use product.brand_id directly so
	// links work in both modes.
	const brand = $derived(data.brand as { id: string; name: string } | null);
	const isMultiBrand = $derived(brand === null);
	const seasons = $derived(data.seasons as { id: string; name: string }[]);
	const canEdit = $derived(['admin', 'owner', 'member'].includes(data.membership?.role ?? ''));

	// Mutable list — initial page from server, appended via infinite scroll
	let productList = $state<ProductRow[]>([]);
	const selectedIds = $derived($selectedProductIds);
	function toggleSelected(id: string, v: boolean) {
		const current = $selectedProductIds;
		if (v) selectedProductIds.set(current.includes(id) ? current : [...current, id]);
		else selectedProductIds.set(current.filter((x) => x !== id));
	}
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let sentinelEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		productList = data.products as ProductRow[];
		hasMore = Boolean(data.hasMore);
	});

	let search = $state($page.url.searchParams.get('search') ?? '');
	let seasonFilter = $state($page.url.searchParams.get('season') ?? '');
	let brandFilter = $state($page.url.searchParams.get('brand') ?? '');
	let categoryFilter = $state($page.url.searchParams.get('category') ?? '');
	let priceRange = $state<[number, number]>([0, 500]);
	let atsOnly = $state(false);
	let showArchived = $state(false);
	let showImport = $state(false);

	const maxProductPrice = $derived(
		Math.max(...productList.map((p) => Number(p.wholesale_price)), 500)
	);

	const categories = $derived(
		[...new Set(productList.map((p) => p.category).filter(Boolean) as string[])].sort()
	);

	// Client-side filters for price/ATS (applied on top of server-paginated results)
	const filtered = $derived(
		productList.filter((p) => {
			const price = Number(p.wholesale_price);
			const matchesPrice = price >= priceRange[0] && price <= priceRange[1];
			const matchesArchive = showArchived ? true : !p.archived_at;
			const matchesAts = !atsOnly || p.ats;
			return matchesPrice && matchesArchive && matchesAts;
		})
	);

	const archivedCount = $derived(productList.filter((p) => p.archived_at).length);

	// Server-side filter via URL params
	function setFilter(key: string, value: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams($page.url.searchParams);
		if (!value) params.delete(key);
		else params.set(key, value);
		goto(resolve(`/products?${params.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	const debouncedSearch = debounce((value: string) => {
		setFilter('search', value);
	}, 300);

	function onSearchInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		search = value;
		debouncedSearch(value);
	}

	// Infinite scroll
	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
			const params = new URLSearchParams();
			params.set('offset', String(productList.length));
			params.set('limit', String(PAGE_SIZE));
			// Multi-brand mode (Nx-BLSR or rep org): append every brand id so the
			// API pulls products across all of them. If a brand filter is active,
			// scope to that one brand instead.
			const scopedBrandIds = brandFilter ? [brandFilter] : (data.brands ?? []).map((b) => b.id);
			for (const id of scopedBrandIds) params.append('brand_id', id);
			if (search) params.set('q', search);
			if (seasonFilter) {
				for (const id of seasonIdsByName(seasons, seasonFilter)) params.append('season_id', id);
			}
			if (categoryFilter) params.set('category', categoryFilter);
			if (showArchived) params.set('archived', 'true');
			const res = await fetch(`/api/products?${params.toString()}`);
			if (res.ok) {
				const json = await res.json();
				productList = [...productList, ...(json.products as ProductRow[])];
				hasMore = Boolean(json.hasMore);
			}
		} finally {
			loadingMore = false;
		}
	}

	$effect(() => {
		if (!sentinelEl) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !loadingMore) {
					loadMore();
				}
			},
			{ rootMargin: '200px' }
		);
		observer.observe(sentinelEl);
		return () => observer.disconnect();
	});
	// Import is now handled by <ProductImportModal>, which wraps
	// <ProductImportFlow> and POSTs to /api/products/import on commit.
	// We just need to know when it finishes so we can refresh the list.
</script>

<div class="space-y-6">
	<PageHeader
		title="Products"
		subtitle="{data.totalCount ?? productList.length} product{(data.totalCount ??
			productList.length) !== 1
			? 's'
			: ''}"
	>
		{#if canEdit && !isMultiBrand && brand}
			<Button variant="outline" class="hidden sm:inline-flex" onclick={() => (showImport = true)}
				>Import</Button
			>
			<Button href="/products/new" class="min-w-[100px]">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="-ml-1 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
				>
				Add<span class="hidden sm:inline"> Product</span>
			</Button>
		{/if}
	</PageHeader>

	<!-- Filters -->
	<div
		class="-mx-4 flex min-h-[44px] items-center gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0"
	>
		<SearchInput
			placeholder="Search products..."
			value={search}
			oninput={onSearchInput}
			class="w-64 shrink-0"
		/>
		{#if (data.brands ?? []).length > 1}
			<BrandFilter
				brands={data.brands ?? []}
				value={brandFilter}
				onValueChange={(v) => {
					brandFilter = v;
					setFilter('brand', v);
				}}
			/>
		{/if}
		<SeasonFilter
			{seasons}
			value={seasonFilter}
			onValueChange={(v) => {
				seasonFilter = v;
				setFilter('season', v);
			}}
		/>
		{#if categories.length > 0}
			<CategoryFilter
				{categories}
				value={categoryFilter}
				onValueChange={(v) => {
					categoryFilter = v;
					setFilter('category', v);
				}}
			/>
		{/if}
		<PriceFilterDropdown bind:value={priceRange} maxPrice={maxProductPrice} />
		<label class="flex h-10 shrink-0 items-center gap-2 text-sm lg:ml-auto" for="ats-only">
			ATS Only
			<Switch id="ats-only" bind:checked={atsOnly} aria-label="ATS Only" />
		</label>
		{#if archivedCount > 0}
			<button
				class="text-sm text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => (showArchived = !showArchived)}
			>
				{showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
			</button>
		{/if}
	</div>

	<!-- Product grid -->
	{#if filtered.length === 0}
		<div class="rounded-none p-12 text-center">
			{#if search || brandFilter || seasonFilter || categoryFilter || atsOnly}
				<p class="text-lg font-semibold">No products match your filters</p>
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
						d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
					/>
				</svg>
				<p class="mt-4 text-lg font-semibold">Your catalog lives here</p>
				<p class="mt-2 text-sm text-muted-foreground">
					Add your first product or upload a linesheet to get started.
				</p>
			{/if}
		</div>
	{:else}
		<div class="-mx-4 grid grid-cols-2 gap-0 sm:mx-0 sm:gap-4 lg:grid-cols-3">
			{#each filtered as product (product.id)}
				{@const seasonRow = seasons.find((s) => s.id === product.season_id)}
				<div class="relative">
					{#if selectedIds.includes(product.id)}
						<div
							class="pointer-events-none absolute inset-0 z-10 border-6 border-foreground/20"
						></div>
					{/if}
					<ProductCard
						productId={product.id}
						href={resolve(`/products/${product.id}`)}
						name={product.name}
						styleNumber={product.style_number}
						wholesalePrice={Number(product.wholesale_price)}
						images={product.product_images ?? []}
						brandName={product.brands?.name}
						seasonLabel={[seasonRow?.name, product.product_year].filter(Boolean).join(' ')}
						archived={!!product.archived_at}
					>
						{#snippet overlay()}
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
							<button
								type="button"
								aria-label={selectedIds.includes(product.id)
									? 'Deselect product'
									: 'Select product'}
								aria-pressed={selectedIds.includes(product.id)}
								class="group/check absolute top-2 right-2 p-2 transition-opacity [@media(hover:none)]:opacity-100 {selectedIds.includes(
									product.id
								)
									? 'opacity-100'
									: 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									toggleSelected(product.id, !selectedIds.includes(product.id));
								}}
							>
								<span class="pointer-events-none flex rounded-sm bg-white">
									<Checkbox
										checked={selectedIds.includes(product.id)}
										class="h-6 w-6 group-hover/check:border-foreground"
									/>
								</span>
							</button>
						{/snippet}
					</ProductCard>
				</div>
			{/each}
		</div>

		{#if hasMore || loadingMore}
			<div bind:this={sentinelEl} class="flex items-center justify-center py-6">
				{#if loadingMore}
					<span class="text-sm text-muted-foreground">Loading more products…</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>

{#if brand}
	<ProductImportModal
		bind:open={showImport}
		brandId={brand.id}
		{seasons}
		onOpenChange={(v) => (showImport = v)}
		onImported={() => invalidateAll()}
	/>
{/if}
