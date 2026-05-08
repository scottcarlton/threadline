<script lang="ts">
	import { page } from '$app/stores';
	import { SvelteMap } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cart } from '$lib/stores/cart.js';
	import type { Product, ProductImage } from '$lib/types/database.js';
	import StockPill from '$lib/components/inventory/StockPill.svelte';
	import { aggregateStockStatus } from '$lib/utils/products';
	import { getAttributeLabel } from '$lib/data/product-attributes';
	import QtyStepper from '$lib/components/shared/QtyStepper.svelte';

	let { data } = $props();

	const product = $derived(
		data.product as Product & {
			brands: { id: string; name: string } | null;
			seasons: { id: string; name: string } | null;
			product_variants: {
				id: string;
				color: string | null;
				color_hex: string | null;
				size: string | null;
				sku: string | null;
				stock_qty: number | null;
				stock_threshold: number | null;
				shopify_variant_id: string | null;
			}[];
			product_images: ProductImage[];
		}
	);

	const stockAgg = $derived(
		product.ats ? aggregateStockStatus(product.product_variants ?? []) : null
	);
	const isOutOfStock = $derived(product.ats && stockAgg === 'out');

	type ImageGroup = {
		color: string;
		primary: ProductImage | null;
		hover: ProductImage | null;
		video: ProductImage | null;
	};

	const variantImageGroups = $derived(() => {
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

	let activeGroupIndex = $state(
		(() => {
			const imgId = $page.url.searchParams.get('color');
			if (!imgId) return 0;
			const idx = variantImageGroups().findIndex(
				(g) => g.primary?.id === imgId || g.hover?.id === imgId
			);
			return idx >= 0 ? idx : 0;
		})()
	);
	let selectedSubImage = $state<ProductImage | null>(null);
	let playingVideo = $state(false);
	let videoEl = $state<HTMLVideoElement | null>(null);

	const activeGroup = $derived(
		variantImageGroups()[activeGroupIndex] ?? variantImageGroups()[0] ?? null
	);

	$effect(() => {
		const imgId = activeGroup?.primary?.id;
		if (!imgId) return;
		const url = new URL(window.location.href);
		url.searchParams.set('color', imgId);
		history.replaceState(history.state, '', url.toString());
	});
	const activeImage = $derived(
		selectedSubImage ?? activeGroup?.primary ?? (product.product_images ?? [])[0] ?? null
	);
	const selectedColor = $derived(activeGroup?.color ?? '');

	const groupImages = $derived(
		[activeGroup?.primary, activeGroup?.hover, activeGroup?.video].filter(
			(img): img is ProductImage => img != null
		)
	);
	const activeImageIndex = $derived(
		activeImage ? groupImages.findIndex((img) => img.id === activeImage.id) : 0
	);

	function prevImage() {
		if (groupImages.length <= 1) return;
		const idx = (activeImageIndex - 1 + groupImages.length) % groupImages.length;
		const img = groupImages[idx];
		if (img.role === 'video') {
			playingVideo = true;
			selectedSubImage = null;
		} else {
			playingVideo = false;
			selectedSubImage = img;
		}
	}

	function nextImage() {
		if (groupImages.length <= 1) return;
		const idx = (activeImageIndex + 1) % groupImages.length;
		const img = groupImages[idx];
		if (img.role === 'video') {
			playingVideo = true;
			selectedSubImage = null;
		} else {
			playingVideo = false;
			selectedSubImage = img;
		}
	}

	$effect(() => {
		void activeGroupIndex;
		selectedSubImage = null;
		playingVideo = false;
	});

	const variantThumbnails = $derived(variantImageGroups().map((g) => g.primary!));

	const colors = $derived([
		...new Set(product.product_variants?.map((v) => v.color).filter(Boolean))
	] as string[]);

	const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

	const availableSizesForColor = $derived(() => {
		const variants = product.product_variants ?? [];
		const filtered = selectedColor ? variants.filter((v) => v.color === selectedColor) : variants;
		return new Set(filtered.map((v) => v.size).filter(Boolean) as string[]);
	});

	const allSizes = $derived([
		...new Set(product.product_variants?.map((v) => v.size).filter(Boolean))
	] as string[]);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

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
			const fallbackImg =
				(product.product_images ?? []).find((i) => i.is_primary) ??
				(product.product_images ?? [])[0];
			cart.addItem({
				productId: product.id,
				brandId: product.brand_id,
				productName: product.name,
				styleNumber: product.style_number,
				brandName: product.brands?.name ?? 'Unknown',
				price: product.wholesale_price ?? 0,
				imageUrl: fallbackImg ? `/api/products/${product.id}/images/${fallbackImg.id}` : null,
				colors: colors,
				sizes: allSizes,
				addedAt: new Date().toISOString(),
				seasonId: product.season_id ?? null,
				seasonName: product.seasons?.name ?? null,
				selectedColor: selectedColor,
				sizeQtys: {}
			});
			return;
		}

		for (const [color, sizeQtys] of colorsWithQtys) {
			const key = cart.cartKey({ productId: product.id, selectedColor: color });
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
					colors: colors,
					sizes: allSizes,
					addedAt: new Date().toISOString(),
					seasonId: product.season_id ?? null,
					seasonName: product.seasons?.name ?? null,
					selectedColor: color,
					sizeQtys
				});
			}
		}
	}
</script>

<div class="space-y-6">
	<!-- Back link -->
	<button
		onclick={() => history.back()}
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
	</button>

	<div class="grid gap-8 lg:grid-cols-2">
		<!-- Left: primary image + sub-images -->
		<div class="lg:sticky lg:top-6 lg:self-start">
			<div class="group/main relative aspect-[4/5] w-full overflow-hidden bg-muted">
				{#if playingVideo && activeGroup?.video}
					<video
						bind:this={videoEl}
						src={`/api/products/${product.id}/images/${activeGroup.video.id}`}
						class="absolute inset-0 h-full w-full cursor-pointer object-cover"
						autoplay
						loop
						muted
						playsinline
						onclick={() => {
							if (videoEl?.paused) videoEl.play();
							else if (videoEl) videoEl.pause();
						}}
					></video>
				{:else if activeImage}
					<img
						src={`/api/products/${product.id}/images/${activeImage.id}`}
						alt={product.name}
						class="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
					/>
				{:else}
					<div class="flex h-full w-full items-center justify-center text-muted-foreground">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							class="h-16 w-16 opacity-40"
						>
							<rect x="3" y="3" width="18" height="18" rx="2" />
							<circle cx="8.5" cy="8.5" r="1.5" />
							<path d="M21 15l-5-5L5 21" />
						</svg>
					</div>
				{/if}
				{#if groupImages.length > 1}
					<div class="absolute right-3 bottom-3 flex gap-1.5">
						<button
							type="button"
							aria-label="Previous image"
							class="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-foreground shadow-sm transition-colors hover:bg-white dark:bg-black/80 dark:hover:bg-black"
							onclick={prevImage}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M15.75 19.5L8.25 12l7.5-7.5"
								/>
							</svg>
						</button>
						<button
							type="button"
							aria-label="Next image"
							class="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-foreground shadow-sm transition-colors hover:bg-white dark:bg-black/80 dark:hover:bg-black"
							onclick={nextImage}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M8.25 4.5l7.5 7.5-7.5 7.5"
								/>
							</svg>
						</button>
					</div>
				{/if}
			</div>

			{#if activeGroup && activeGroup.primary && activeGroup.hover}
				<div class="mt-2 grid grid-cols-2 gap-2">
					{#if activeGroup.primary}
						<div
							role="button"
							tabindex="-1"
							class="relative aspect-square overflow-hidden bg-muted"
							onmouseenter={() => {
								playingVideo = false;
								selectedSubImage = activeGroup.primary;
							}}
						>
							<img
								src="/api/products/{product.id}/images/{activeGroup.primary.id}"
								alt="{product.name} — primary"
								class="h-full w-full object-cover"
							/>
						</div>
					{/if}
					{#if activeGroup.hover}
						<div
							role="button"
							tabindex="-1"
							class="relative aspect-square overflow-hidden bg-muted"
							onmouseenter={() => {
								if (activeGroup.video) {
									playingVideo = true;
									selectedSubImage = null;
								} else {
									selectedSubImage = activeGroup.hover;
								}
							}}
						>
							<img
								src="/api/products/{product.id}/images/{activeGroup.hover.id}"
								alt="{product.name} — hover"
								class="h-full w-full object-cover"
							/>
							{#if activeGroup.video}
								<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
									<div class="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="currentColor"
											class="h-5 w-5 text-white"
										>
											<path
												d="M6 20.1957V3.80421C6 3.01878 6.86395 2.53993 7.53 2.95621L20.6432 11.152C21.2699 11.5436 21.2699 12.4563 20.6432 12.848L7.53 21.0437C6.86395 21.46 6 20.9812 6 20.1957Z"
											></path>
										</svg>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right: product info -->
		<div class="space-y-6">
			<div>
				<p class="text-sm text-muted-foreground">{product.brands?.name ?? ''}</p>
				<h1 class="text-2xl font-bold">{product.name}</h1>
				<p class="mt-1 text-sm text-muted-foreground">{product.style_number}</p>
			</div>

			<div>
				<p class="text-xs text-muted-foreground">wholesale</p>
				<p class="text-2xl font-semibold">{fmt.format(product.wholesale_price ?? 0)}</p>
				{#if product.retail_price}
					<p class="text-sm text-muted-foreground">
						{fmt.format(Number(product.retail_price))} — retail
					</p>
				{/if}
			</div>

			<!-- Variant color thumbnails -->
			{#if variantThumbnails.length > 1}
				<div class="flex flex-wrap gap-3">
					{#each variantImageGroups() as group, i (group.primary!.id)}
						{@const cUnits = colorUnitsLocal(group.color)}
						<div class="relative">
							<button
								type="button"
								class="relative h-14 w-14 shrink-0 overflow-hidden transition-all"
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
								>
									{cUnits}
								</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if stockAgg}
				<StockPill status={stockAgg} qty={null} hideQty />
			{/if}

			{#if product.description}
				<p class="text-base leading-relaxed text-muted-foreground">{product.description}</p>
			{/if}

			{#if product.attributes && product.attributes.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each product.attributes as attr (attr)}
						<span class="border border-border px-2.5 py-1 text-sm">{getAttributeLabel(attr)}</span>
					{/each}
				</div>
			{/if}

			<!-- Size quantity inputs -->
			<div>
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

			<!-- Cart actions -->
			{#if isOutOfStock}
				<Button class="w-full" disabled>Out of stock</Button>
			{:else}
				<Button class="w-full" size="lg" onclick={addToCart}>
					{totalUnits}
					{totalUnits === 1 ? 'unit' : 'units'} — Add to Cart
				</Button>
			{/if}
		</div>
	</div>
</div>
