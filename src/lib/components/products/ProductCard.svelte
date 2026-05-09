<script lang="ts">
	import type { Snippet } from 'svelte';
	import ProductImageCarousel from '$lib/components/shared/ProductImageCarousel.svelte';

	type CardImage = {
		id: string;
		is_primary: boolean;
		sort_order?: number | null;
		role?: 'primary' | 'hover' | 'video' | null;
		variant_id?: string | null;
	};

	type Props = {
		productId: string;
		href: string;
		name: string;
		styleNumber: string;
		wholesalePrice: number;
		images: CardImage[];
		seasonLabel?: string | null;
		brandName?: string | null;
		archived?: boolean;
		overlay?: Snippet;
		action?: Snippet;
		onImageSelect?: (imageId: string) => void;
	};

	let {
		productId,
		href,
		name,
		styleNumber,
		wholesalePrice,
		images,
		seasonLabel = null,
		brandName = null,
		archived = false,
		overlay,
		action,
		onImageSelect
	}: Props = $props();

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const metaLine = $derived([brandName, seasonLabel].filter(Boolean).join(' · '));

	let activeImageId = $state<string | null>(null);
	const activeHref = $derived(
		activeImageId ? `${href}${href.includes('?') ? '&' : '?'}color=${activeImageId}` : href
	);
</script>

<div class="group rounded-none transition-all duration-200 {archived ? 'opacity-50' : ''}">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- caller passes pre-resolved href -->
	<a href={activeHref} class="block">
		<ProductImageCarousel
			{productId}
			{images}
			alt={name}
			aspect="aspect-square"
			{overlay}
			onselect={(id) => {
				activeImageId = id;
				onImageSelect?.(id);
			}}
		></ProductImageCarousel>
		<div class="p-4">
			<p class="text-xs text-muted-foreground">{styleNumber}</p>
			<div
				class="mt-0.5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
			>
				<div class="min-w-0">
					<p class="text-sm font-medium">{name}</p>
					{#if metaLine}
						<p class="mt-0.5 text-sm text-muted-foreground">{metaLine}</p>
					{/if}
				</div>
				<div class="shrink-0 sm:text-right">
					<p class="text-sm font-medium">{fmt.format(wholesalePrice)}</p>
				</div>
			</div>
		</div>
	</a>
	{#if action}
		<div class="px-4 pb-4">
			{@render action()}
		</div>
	{/if}
</div>
