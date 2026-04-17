<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import { cart } from '$lib/stores/cart.js';
	import type { Product } from '$lib/types/database.js';

	let { data } = $props();

	const brands = $derived(data.brands as { id: string; name: string; logo_url: string | null }[]);
	const products = $derived(
		data.products as (Product & {
			brands: { id: string; name: string } | null;
			product_variants: { id: string; color: string | null; size: string | null }[];
			product_images: { id: string; file_path: string; is_primary: boolean }[];
		})[]
	);

	let search = $state('');
	const brandFilter = $derived($page.url.searchParams.get('brand') ?? '');

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

	const filtered = $derived(
		products.filter((p) => {
			const matchesBrand = !brandFilter || p.brand_id === brandFilter;
			const matchesSearch =
				!search ||
				p.name.toLowerCase().includes(search.toLowerCase()) ||
				p.style_number.toLowerCase().includes(search.toLowerCase()) ||
				(p.category?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
				(p.brands?.name.toLowerCase().includes(search.toLowerCase()) ?? false);
			return matchesBrand && matchesSearch;
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
						class="rounded-lg border px-3 py-1.5 text-sm transition-colors {brandFilter === brand.id
							? 'border-primary bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:border-foreground/20 hover:text-foreground'}"
						onclick={() => setBrandFilter(brand.id)}
					>
						{brand.name}
					</button>
				{/each}
			</div>
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
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{#each filtered as product (product.id)}
					{@const primaryImage =
						product.product_images?.find((i) => i.is_primary) ?? product.product_images?.[0]}
					{@const inCart = $cart.some((i) => i.productId === product.id)}
					<div
						class="group rounded-none border bg-card transition-all duration-200 hover:border-foreground/20 hover:shadow-md"
					>
						<a href={resolve(`/shop/${product.id}`)} class="block">
							<div class="aspect-[4/3] overflow-hidden rounded-t-xl bg-muted">
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
							<div class="p-4 pb-2">
								{#if !brandFilter}
									<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
										{product.brands?.name}
									</p>
								{/if}
								<p class="text-sm text-muted-foreground">{product.style_number}</p>
								<p class="mt-0.5 text-base font-normal">{product.name}</p>
								<div class="mt-2 flex items-center justify-between">
									<span class="text-base font-normal"
										>{fmt.format(Number(product.wholesale_price))}</span
									>
									<span class="text-sm text-muted-foreground"
										>{getVariantSummary(product.product_variants ?? [])}</span
									>
								</div>
								{#if product.category}
									<span
										class="mt-2 inline-flex rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
										>{product.category}</span
									>
								{/if}
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
											addedAt: new Date().toISOString()
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
