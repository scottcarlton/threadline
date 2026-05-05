<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input, SearchInput } from '$lib/components/ui/input/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import PriceFilterDropdown from '$lib/components/shared/PriceFilterDropdown.svelte';
	import SeasonFilter from '$lib/components/shared/SeasonFilter.svelte';
	import CategoryFilter from '$lib/components/shared/CategoryFilter.svelte';
	import { seasonIdsByName } from '$lib/utils/seasons.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import ProductImportModal from '$lib/components/products/ProductImportModal.svelte';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import ProductCard from '$lib/components/products/ProductCard.svelte';
	import type { Product } from '$lib/types/database.js';

	let { data } = $props();
	const brand = $derived(data.brand as { id: string; name: string });
	const products = $derived(
		data.products as (Product & {
			product_variants: { id: string; color: string | null; size: string | null }[];
			product_images: { id: string; file_path: string; is_primary: boolean }[];
		})[]
	);
	const seasons = $derived(data.seasons as { id: string; name: string }[]);
	const canEdit = $derived(data.membership?.role !== 'guest');

	let search = $state('');
	let seasonFilter = $state('');
	let categoryFilter = $state('');
	let priceRange = $state<[number, number]>([0, 500]);
	let atsOnly = $state(false);
	let showArchived = $state(false);
	let showImport = $state(false);

	const maxProductPrice = $derived(
		Math.max(...products.map((p) => Number(p.wholesale_price)), 500)
	);

	const categories = $derived(
		[...new Set(products.map((p) => p.category).filter(Boolean) as string[])].sort()
	);

	const selectedSeasonIds = $derived(
		seasonFilter ? new Set(seasonIdsByName(seasons, seasonFilter)) : null
	);
	const filtered = $derived(
		products.filter((p) => {
			const matchesSearch =
				p.name.toLowerCase().includes(search.toLowerCase()) ||
				p.style_number.toLowerCase().includes(search.toLowerCase()) ||
				(p.category?.toLowerCase().includes(search.toLowerCase()) ?? false);
			const matchesSeason =
				!selectedSeasonIds || (p.season_id && selectedSeasonIds.has(p.season_id));
			const matchesCategory = !categoryFilter || p.category === categoryFilter;
			const price = Number(p.wholesale_price);
			const matchesPrice = price >= priceRange[0] && price <= priceRange[1];
			const matchesArchive = showArchived ? true : !p.archived_at;
			const matchesAts = !atsOnly || p.ats;
			return (
				matchesSearch &&
				matchesSeason &&
				matchesCategory &&
				matchesPrice &&
				matchesArchive &&
				matchesAts
			);
		})
	);

	const archivedCount = $derived(products.filter((p) => p.archived_at).length);
	// Add product form
	let adding = $state(false);
	let newStyleNumber = $state('');
	let newName = $state('');
	let newWholesalePrice = $state('');
	let newRetailPrice = $state('');
	let newCategory = $state('');
	let newDescription = $state('');
	let newSeasonId = $state('');
	let saving = $state(false);
	let addError = $state('');

	function resetForm() {
		newStyleNumber = '';
		newName = '';
		newWholesalePrice = '';
		newRetailPrice = '';
		newCategory = '';
		newDescription = '';
		newSeasonId = '';
		addError = '';
		adding = false;
	}

	async function handleAdd() {
		if (!newStyleNumber.trim() || !newName.trim()) return;
		saving = true;
		addError = '';
		const { error } = await supabase.from('products').insert({
			organization_id: data.organization?.id,
			brand_id: brand.id,
			style_number: newStyleNumber.trim(),
			name: newName.trim(),
			wholesale_price: parseFloat(newWholesalePrice) || 0,
			retail_price: parseFloat(newRetailPrice) || null,
			category: newCategory.trim() || null,
			description: newDescription.trim() || null,
			season_id: newSeasonId || null
		});
		saving = false;
		if (error) {
			addError = error.message;
			return;
		}
		resetForm();
		invalidateAll();
	}

	// Import is now handled by <ProductImportModal>, which wraps
	// <ProductImportFlow> and POSTs to /api/products/import on commit.

	function csvEscape(value: unknown): string {
		if (value === null || value === undefined) return '';
		const s = String(value);
		if (s.includes(',') || s.includes('"') || s.includes('\n')) {
			return `"${s.replace(/"/g, '""')}"`;
		}
		return s;
	}

	function handleExport() {
		const seasonName = new Map(seasons.map((s) => [s.id, s.name] as const));
		const header = [
			'style_number',
			'name',
			'wholesale_price',
			'retail_price',
			'category',
			'season',
			'sizes',
			'colors',
			'description',
			'archived'
		];
		const rows = filtered.map((p) => {
			const sizes = [
				...new Set((p.product_variants ?? []).map((v) => v.size).filter(Boolean))
			].join('|');
			const colors = [
				...new Set((p.product_variants ?? []).map((v) => v.color).filter(Boolean))
			].join('|');
			return [
				p.style_number,
				p.name,
				p.wholesale_price,
				p.retail_price ?? '',
				p.category ?? '',
				p.season_id ? (seasonName.get(p.season_id) ?? '') : '',
				sizes,
				colors,
				p.description ?? '',
				p.archived_at ? 'true' : 'false'
			]
				.map(csvEscape)
				.join(',');
		});
		const csv = [header.join(','), ...rows].join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${brand.name}-products-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between">
		<div>
			<Button variant="ghost" size="sm" href="/brands/{brand.id}"
				><LongArrow direction="left" /> {brand.name}</Button
			>
			<h1 class="text-3xl">Products</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{filtered.length} product{filtered.length !== 1 ? 's' : ''}
			</p>
		</div>
		{#if canEdit}
			<div class="flex items-center gap-2">
				<Button variant="outline" onclick={handleExport} disabled={filtered.length === 0}
					>Export</Button
				>
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
			</div>
		{/if}
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-3">
		<div class="max-w-xs flex-1">
			<SearchInput placeholder="Search products..." bind:value={search} />
		</div>
		<SeasonFilter {seasons} value={seasonFilter} onValueChange={(v) => (seasonFilter = v)} />
		{#if categories.length > 0}
			<CategoryFilter
				{categories}
				value={categoryFilter}
				onValueChange={(v) => (categoryFilter = v)}
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

	<!-- Add product form -->
	{#if adding}
		<Card>
			<CardContent class="space-y-4 pt-5 pb-5">
				<p class="text-sm font-medium">New Product</p>
				{#if addError}
					<div class="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{addError}</div>
				{/if}
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="space-y-2">
						<Label for="style">Style Number *</Label>
						<Input id="style" bind:value={newStyleNumber} placeholder="e.g. VR-2001" />
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="name">Name *</Label>
						<Input id="name" bind:value={newName} placeholder="e.g. Silk Button-Down Blouse" />
					</div>
				</div>
				<div class="grid gap-4 sm:grid-cols-4">
					<div class="space-y-2">
						<Label for="wholesale">Wholesale Price *</Label>
						<Input
							id="wholesale"
							type="number"
							step="0.01"
							bind:value={newWholesalePrice}
							placeholder="0.00"
						/>
					</div>
					<div class="space-y-2">
						<Label for="retail">Retail Price</Label>
						<Input
							id="retail"
							type="number"
							step="0.01"
							bind:value={newRetailPrice}
							placeholder="0.00"
						/>
					</div>
					<div class="space-y-2">
						<Label for="category">Category</Label>
						<Input id="category" bind:value={newCategory} placeholder="e.g. Tops" />
					</div>
					<div class="space-y-2">
						<Label for="season">Season</Label>
						<select
							id="season"
							bind:value={newSeasonId}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<option value="">None</option>
							{#each seasons as season (season.id)}
								<option value={season.id}>{season.name}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="space-y-2">
					<Label for="desc">Description</Label>
					<Input id="desc" bind:value={newDescription} placeholder="Optional product description" />
				</div>
				<div class="flex gap-2">
					<Button
						size="sm"
						onclick={handleAdd}
						loading={saving}
						disabled={!newStyleNumber.trim() || !newName.trim()}
					>
						Add Product
					</Button>
					<Button variant="outline" size="sm" onclick={resetForm}>Cancel</Button>
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Product grid -->
	{#if filtered.length === 0 && !adding}
		<div class="rounded-none border border-dashed p-10 text-center">
			<p class="text-sm text-muted-foreground">
				{search || seasonFilter || categoryFilter || atsOnly
					? 'No products match your filters.'
					: 'No products yet. Add your first product to build the catalog.'}
			</p>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each filtered as product (product.id)}
				{@const seasonRow = seasons.find((s) => s.id === product.season_id)}
				<ProductCard
					productId={product.id}
					href={resolve(`/brands/${brand.id}/products/${product.id}`)}
					name={product.name}
					styleNumber={product.style_number}
					wholesalePrice={Number(product.wholesale_price)}
					images={product.product_images ?? []}
					variants={product.product_variants ?? []}
					seasonLabel={[seasonRow?.name, product.product_year].filter(Boolean).join(' ')}
					category={product.category}
					archived={!!product.archived_at}
					border
				/>
			{/each}
		</div>
	{/if}
</div>

<ProductImportModal
	bind:open={showImport}
	brandId={brand.id}
	{seasons}
	onOpenChange={(v) => (showImport = v)}
	onImported={() => invalidateAll()}
/>
