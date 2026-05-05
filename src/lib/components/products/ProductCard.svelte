<script lang="ts">
	import type { Snippet } from 'svelte';
	import ProductImageCarousel from '$lib/components/shared/ProductImageCarousel.svelte';
	import { getVariantSummary } from '$lib/utils/products';

	type CardImage = {
		id: string;
		is_primary: boolean;
		sort_order?: number | null;
		role?: 'primary' | 'hover' | null;
		variant_id?: string | null;
	};

	type CardVariant = {
		id: string;
		color: string | null;
		size: string | null;
	};

	type Props = {
		productId: string;
		href: string;
		name: string;
		styleNumber: string;
		wholesalePrice: number;
		images: CardImage[];
		variants: CardVariant[];
		seasonLabel?: string | null;
		brandName?: string | null;
		category?: string | null;
		archived?: boolean;
		border?: boolean;
		overlay?: Snippet;
		action?: Snippet;
	};

	let {
		productId,
		href,
		name,
		styleNumber,
		wholesalePrice,
		images,
		variants,
		seasonLabel = null,
		brandName = null,
		category = null,
		archived = false,
		border = false,
		overlay,
		action
	}: Props = $props();

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const variantSummary = $derived(getVariantSummary(variants));
	const metaLine = $derived([brandName, seasonLabel].filter(Boolean).join(' · '));
</script>

<div
	class="group rounded-none bg-card transition-all duration-200 {archived
		? 'opacity-50'
		: ''} {border ? 'border hover:border-foreground/20 hover:shadow-md' : ''}"
>
	<a {href} class="block">
		<ProductImageCarousel {productId} {images} alt={name} aspect="aspect-square">
			{#snippet overlay()}
				{#if overlay}
					{@render overlay()}
				{/if}
			{/snippet}
		</ProductImageCarousel>
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
					<p class="mt-0.5 text-xs text-muted-foreground">{variantSummary}</p>
				</div>
			</div>
			{#if category}
				<span
					class="mt-2 inline-flex rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
				>
					{category}
				</span>
			{/if}
		</div>
	</a>
	{#if action}
		<div class="px-4 pb-4">
			{@render action()}
		</div>
	{/if}
</div>
