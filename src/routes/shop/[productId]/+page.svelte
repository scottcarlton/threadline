<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { cart } from '$lib/stores/cart.js';
	import type { Product } from '$lib/types/database.js';
	import StockPill from '$lib/components/inventory/StockPill.svelte';
	import { deriveStockStatus, type StockStatus } from '$lib/inventory/status';

	let { data } = $props();

	const product = $derived(
		data.product as Product & {
			brands: { id: string; name: string } | null;
			product_variants: {
				id: string;
				color: string | null;
				size: string | null;
				sku: string | null;
				stock_qty: number | null;
				stock_threshold: number | null;
				shopify_variant_id: string | null;
			}[];
			product_images: { id: string; file_path: string; is_primary: boolean; sort_order: number }[];
		}
	);

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

	const stockAgg = $derived(
		product.ats ? aggregateStockStatus(product.product_variants ?? []) : null
	);
	const isOutOfStock = $derived(product.ats && stockAgg === 'out');

	const images = $derived(product.product_images ?? []);
	const primaryImage = $derived(images[0] ?? null);
	let selectedImageIndex = $state(0);
	let lightboxOpen = $state(false);

	const colors = $derived([
		...new Set(product.product_variants?.map((v) => v.color).filter(Boolean))
	]);
	const sizes = $derived([
		...new Set(product.product_variants?.map((v) => v.size).filter(Boolean))
	]);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const inCart = $derived($cart.some((i) => i.productId === product.id));

	function addToCart() {
		cart.addItem({
			productId: product.id,
			brandId: product.brand_id,
			productName: product.name,
			styleNumber: product.style_number,
			brandName: product.brands?.name ?? 'Unknown',
			price: product.wholesale_price ?? 0,
			imageUrl: primaryImage ? `/api/products/${product.id}/images/${primaryImage.id}` : null,
			colors: colors as string[],
			sizes: sizes as string[],
			addedAt: new Date().toISOString()
		});
	}

	function removeFromCart() {
		cart.removeItem(product.id);
	}

	function openLightbox(index: number) {
		selectedImageIndex = index;
		lightboxOpen = true;
	}

	function closeLightbox() {
		lightboxOpen = false;
	}

	function prevImage() {
		selectedImageIndex = (selectedImageIndex - 1 + images.length) % images.length;
	}

	function nextImage() {
		selectedImageIndex = (selectedImageIndex + 1) % images.length;
	}

	function handleLightboxKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeLightbox();
		if (e.key === 'ArrowLeft') prevImage();
		if (e.key === 'ArrowRight') nextImage();
	}
</script>

<svelte:window onkeydown={lightboxOpen ? handleLightboxKeydown : undefined} />

<div class="mx-auto max-w-5xl space-y-6">
	<!-- Back link -->
	<a
		href={resolve('/shop')}
		class="inline-flex items-center gap-1.5 text-base text-muted-foreground transition-colors hover:text-foreground"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
		</svg>
		Back to Shop
	</a>

	<div class="grid gap-8 lg:grid-cols-2">
		<!-- Images -->
		<div class="space-y-3">
			{#if primaryImage || images.length > 0}
				<!-- Main image -->
				<button
					class="aspect-square w-full cursor-zoom-in overflow-hidden rounded-none bg-muted"
					onclick={() => openLightbox(selectedImageIndex)}
				>
					{#if images[selectedImageIndex]}
						<img
							src="/api/products/{product.id}/images/{images[selectedImageIndex].id}"
							alt={product.name}
							class="h-full w-full object-cover"
						/>
					{/if}
				</button>

				<!-- Thumbnails -->
				{#if images.length > 1}
					<div class="flex gap-2 overflow-x-auto">
						{#each images as img, i (img.id)}
							<button
								class="h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors {i ===
								selectedImageIndex
									? 'border-primary'
									: 'border-transparent hover:border-muted-foreground/30'}"
								onclick={() => (selectedImageIndex = i)}
							>
								<img
									src="/api/products/{product.id}/images/{img.id}"
									alt="{product.name} thumbnail {i + 1}"
									class="h-full w-full object-cover"
								/>
							</button>
						{/each}
					</div>
				{/if}
			{:else}
				<div class="flex aspect-square items-center justify-center rounded-none bg-muted">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-16 w-16 text-muted-foreground/50"
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

		<!-- Product info -->
		<div class="space-y-6">
			<div>
				<p class="text-sm text-muted-foreground">{product.brands?.name ?? ''}</p>
				<h1 class="text-2xl font-bold">{product.name}</h1>
				<p class="mt-1 text-sm text-muted-foreground">Style: {product.style_number}</p>
			</div>

			<div class="text-2xl font-semibold">
				{fmt.format(product.wholesale_price ?? 0)}
				<span class="text-base font-normal text-muted-foreground">wholesale</span>
			</div>

			{#if stockAgg}
				<StockPill status={stockAgg} qty={null} hideQty />
			{/if}

			{#if product.description}
				<p class="text-base leading-relaxed text-muted-foreground">{product.description}</p>
			{/if}

			{#if product.category}
				<div>
					<Badge variant="outline">{product.category}</Badge>
					{#if product.subcategory}
						<Badge variant="outline" class="ml-1">{product.subcategory}</Badge>
					{/if}
				</div>
			{/if}

			{#if colors.length > 0}
				<div>
					<p class="mb-2 text-base font-medium">Colors</p>
					<div class="flex flex-wrap gap-1.5">
						{#each colors as color (color)}
							<span class="rounded-full border px-3 py-1 text-base">{color}</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if sizes.length > 0}
				<div>
					<p class="mb-2 text-base font-medium">Sizes</p>
					<div class="flex flex-wrap gap-1.5">
						{#each sizes as size (size)}
							<span class="rounded-lg border px-2.5 py-1 text-base">{size}</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Add to Cart -->
			<div class="pt-2">
				{#if inCart}
					<Button variant="outline" class="w-full" onclick={removeFromCart}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						In Cart — Remove
					</Button>
				{:else if isOutOfStock}
					<Button class="w-full" disabled>Out of stock</Button>
				{:else}
					<Button class="w-full" onclick={addToCart}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
						Add to Cart
					</Button>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Lightbox -->
{#if lightboxOpen && images.length > 0}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
		onclick={closeLightbox}
	>
		<!-- Close button -->
		<button
			aria-label="Close"
			class="absolute top-4 right-4 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
			onclick={closeLightbox}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>

		<!-- Previous -->
		{#if images.length > 1}
			<button
				aria-label="Previous image"
				class="absolute left-4 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
				onclick={(e) => {
					e.stopPropagation();
					prevImage();
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-8 w-8"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
				</svg>
			</button>
		{/if}

		<!-- Image -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="max-h-[90vh] max-w-[90vw]" onclick={(e) => e.stopPropagation()}>
			<img
				src="/api/products/{product.id}/images/{images[selectedImageIndex].id}"
				alt={product.name}
				class="max-h-[90vh] max-w-[90vw] object-contain"
			/>
		</div>

		<!-- Next -->
		{#if images.length > 1}
			<button
				aria-label="Next image"
				class="absolute right-4 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
				onclick={(e) => {
					e.stopPropagation();
					nextImage();
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-8 w-8"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
				</svg>
			</button>
		{/if}

		<!-- Counter -->
		{#if images.length > 1}
			<div
				class="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white/70"
			>
				{selectedImageIndex + 1} / {images.length}
			</div>
		{/if}
	</div>
{/if}
