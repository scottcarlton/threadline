<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import PriceFilterDropdown from '$lib/components/shared/PriceFilterDropdown.svelte';
	import BulkImportModal from '$lib/components/shared/BulkImportModal.svelte';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import StockPill from '$lib/components/inventory/StockPill.svelte';
	import { deriveStockStatus, type StockStatus } from '$lib/inventory/status';
	import type { Product } from '$lib/types/database.js';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { debounce } from '$lib/utils/debounce.js';

	const PAGE_SIZE = 50;

	type ProductRow = Product & {
		product_variants: {
			id: string;
			color: string | null;
			size: string | null;
			stock_qty: number | null;
			stock_threshold: number | null;
			shopify_variant_id: string | null;
		}[];
		product_images: { id: string; file_path: string; is_primary: boolean }[];
	};

	let { data } = $props();
	const brand = $derived(data.brand as { id: string; name: string });
	const seasons = $derived(data.seasons as { id: string; name: string }[]);
	const canEdit = $derived(['admin', 'owner', 'member'].includes(data.membership?.role ?? ''));

	// Mutable list — initial page from server, appended via infinite scroll
	let productList = $state<ProductRow[]>([]);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let sentinelEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		productList = data.products as ProductRow[];
		hasMore = Boolean(data.hasMore);
	});

	let search = $state($page.url.searchParams.get('search') ?? '');
	let seasonFilter = $state($page.url.searchParams.get('season') ?? '');
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
		goto(resolve(`/products?${params.toString()}`), { replaceState: true });
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
			params.append('brand_id', brand.id);
			if (search) params.set('q', search);
			if (seasonFilter) params.append('season_id', seasonFilter);
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
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// Import
	const productColumns = [
		{ key: 'style_number', label: 'Style Number', required: true },
		{ key: 'name', label: 'Name', required: true },
		{ key: 'wholesale_price', label: 'Wholesale Price', required: true },
		{ key: 'retail_price', label: 'Retail Price' },
		{ key: 'category', label: 'Category' },
		{ key: 'sizes', label: 'Sizes' },
		{ key: 'colors', label: 'Colors' },
		{ key: 'description', label: 'Description' }
	];

	async function handleImport(
		rows: Record<string, string>[]
	): Promise<{ success: number; errors: string[] }> {
		let success = 0;
		const errors: string[] = [];
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!row.style_number?.trim() || !row.name?.trim()) {
				errors.push(`Row ${i + 1}: Style Number and Name are required`);
				continue;
			}
			const yearNum = parseInt(row.product_year ?? '', 10);
			const { data: product, error } = await supabase
				.from('products')
				.insert({
					organization_id: data.organization?.id,
					brand_id: brand.id,
					style_number: row.style_number.trim(),
					name: row.name.trim(),
					wholesale_price: parseFloat(row.wholesale_price) || 0,
					retail_price: parseFloat(row.retail_price) || null,
					category: row.category?.trim() || null,
					description: row.description?.trim() || null,
					season_id: row.season_id || null,
					product_year: Number.isFinite(yearNum) ? yearNum : null
				})
				.select('id')
				.single();
			if (error || !product) {
				errors.push(`Row ${i + 1} (${row.style_number}): ${error?.message ?? 'Failed to create'}`);
				continue;
			}

			const sizes =
				row.sizes
					?.split(',')
					.map((s) => s.trim())
					.filter(Boolean) ?? [];
			const colors =
				row.colors
					?.split(',')
					.map((s) => s.trim())
					.filter(Boolean) ?? [];
			const variants: { product_id: string; color: string | null; size: string | null }[] = [];

			if (sizes.length > 0 && colors.length > 0) {
				for (const color of colors) {
					for (const size of sizes) variants.push({ product_id: product.id, color, size });
				}
			} else if (sizes.length > 0) {
				for (const size of sizes) variants.push({ product_id: product.id, color: null, size });
			} else if (colors.length > 0) {
				for (const color of colors) variants.push({ product_id: product.id, color, size: null });
			}

			if (variants.length > 0) {
				const { error: varErr } = await supabase.from('product_variants').insert(variants);
				if (varErr)
					errors.push(
						`Row ${i + 1} (${row.style_number}): Product created but variants failed — ${varErr.message}`
					);
			}

			success++;
		}
		if (success > 0) invalidateAll();
		return { success, errors };
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
	<PageHeader
		title="Products"
		subtitle="{data.totalCount ?? productList.length} product{(data.totalCount ??
			productList.length) !== 1
			? 's'
			: ''}"
	>
		{#if canEdit}
			<Button variant="outline" onclick={() => (showImport = true)}>Import</Button>
			<Button href="/brands/{brand.id}/products/new">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="-ml-1 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
				>
				Add Product
			</Button>
		{/if}
	</PageHeader>

	<!-- Filters -->
	<div class="flex flex-wrap gap-3">
		<div class="max-w-xs flex-1">
			<SearchInput placeholder="Search products..." value={search} oninput={onSearchInput} />
		</div>
		<SelectField
			items={[
				{ value: '', label: 'All Seasons' },
				...seasons.map((s) => ({ value: s.id, label: s.name }))
			]}
			value={seasonFilter}
			placeholder="All Seasons"
			onValueChange={(v) => {
				seasonFilter = v;
				setFilter('season', v);
			}}
		/>
		{#if categories.length > 0}
			<SelectField
				items={[
					{ value: '', label: 'All Categories' },
					...categories.map((c) => ({ value: c, label: c }))
				]}
				value={categoryFilter}
				placeholder="All Categories"
				onValueChange={(v) => {
					categoryFilter = v;
					setFilter('category', v);
				}}
			/>
		{/if}
		<PriceFilterDropdown bind:value={priceRange} maxPrice={maxProductPrice} />
		<label class="ml-auto flex h-10 items-center gap-2 text-sm" for="ats-only">
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
			{#if search || seasonFilter || categoryFilter || atsOnly}
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
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each filtered as product (product.id)}
				{@const primaryImage =
					product.product_images?.find((i) => i.is_primary) ?? product.product_images?.[0]}
				<a
					href={resolve(`/brands/${brand.id}/products/${product.id}`)}
					class="group rounded-none border bg-card transition-all duration-200 hover:border-foreground/20 hover:shadow-md {product.archived_at
						? 'opacity-50'
						: ''}"
				>
					<div class="aspect-[4/3] overflow-hidden bg-muted">
						{#if primaryImage}
							<img
								src="/api/products/{product.id}/images/{primaryImage.id}"
								alt={product.name}
								class="h-full w-full object-cover"
							/>
						{:else}
							<div class="flex h-full items-center justify-center text-muted-foreground">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-10 w-10"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="1"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
									/>
								</svg>
							</div>
						{/if}
					</div>
					<div class="p-4">
						<p class="text-xs text-muted-foreground">{product.style_number}</p>
						<p class="mt-0.5 text-sm font-medium">{product.name}</p>
						{#if product.season_id || product.product_year}
							{@const seasonRow = seasons.find((s) => s.id === product.season_id)}
							<p class="mt-0.5 text-sm text-muted-foreground">
								{[seasonRow?.name, product.product_year].filter(Boolean).join(' ')}
							</p>
						{/if}
						<div class="mt-2 flex items-center justify-between">
							<span class="text-sm font-medium">{fmt.format(Number(product.wholesale_price))}</span>
							<span class="text-xs text-muted-foreground"
								>{getVariantSummary(product.product_variants ?? [])}</span
							>
						</div>
						{#if product.ats}
							{@const stockAgg = aggregateStockStatus(product.product_variants ?? [])}
							{#if stockAgg}
								<div class="mt-2">
									<StockPill status={stockAgg} qty={null} hideQty />
								</div>
							{/if}
						{/if}
						{#if product.category}
							<span
								class="mt-2 inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
								>{product.category}</span
							>
						{/if}
					</div>
				</a>
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

<BulkImportModal
	open={showImport}
	ontoggle={() => (showImport = false)}
	entityType="product"
	columns={productColumns}
	onimport={handleImport}
	enableLinesheet={true}
	{seasons}
/>
