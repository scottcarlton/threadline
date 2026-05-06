<script lang="ts">
	import StockPill from '$lib/components/inventory/StockPill.svelte';

	type VariantPreview = {
		colorHex?: string;
		isPrimary?: boolean;
		images?: { primary?: File | null };
	};

	type Props = {
		name: string;
		styleNumber: string;
		wholesalePrice: number;
		retailPrice?: number | null;
		ats: boolean;
		featured: boolean;
		hasVariants: boolean;
		variants: VariantPreview[];
		productPrimaryImage?: File | null;
	};

	let {
		name,
		styleNumber,
		wholesalePrice,
		retailPrice,
		ats,
		featured,
		hasVariants,
		variants,
		productPrimaryImage
	}: Props = $props();

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const displayName = $derived(name || 'Product name');
	const displayStyle = $derived(styleNumber || 'STYLE-000');
	const displayPrice = $derived(wholesalePrice > 0 ? fmt.format(wholesalePrice) : '$0');
	const displayMsrp = $derived(retailPrice && retailPrice > 0 ? fmt.format(retailPrice) : null);

	const primaryVariant = $derived(variants.find((v) => v.isPrimary) ?? variants[0]);
	const previewImage = $derived(
		hasVariants
			? primaryVariant?.images?.primary
				? URL.createObjectURL(primaryVariant.images.primary)
				: null
			: productPrimaryImage
				? URL.createObjectURL(productPrimaryImage)
				: null
	);

	const visibleSwatches = $derived(variants.slice(0, 5));
	const overflowCount = $derived(Math.max(0, variants.length - 5));
</script>

<div>
	<p class="mb-2.5 font-mono text-sm text-muted-foreground">preview</p>
	<div class="border border-border bg-card">
		<!-- Image area -->
		<div class="relative flex aspect-square items-center justify-center bg-muted">
			{#if previewImage}
				<img src={previewImage} alt={displayName} class="h-full w-full object-cover" />
			{:else}
				<span class="font-mono text-sm text-foreground/20">{displayStyle}</span>
			{/if}

			{#if ats || featured}
				<div class="absolute top-2.5 left-2.5 flex flex-col gap-1">
					{#if ats}
						<StockPill status="in" qty={null} hideQty />
					{/if}
					{#if featured}
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-0.5 text-sm font-medium text-violet-600 dark:bg-black/90"
						>
							Featured
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Card body -->
		<div class="flex flex-col gap-1.5 p-3.5">
			<p class="font-mono text-sm text-muted-foreground">{displayStyle}</p>
			<p class="text-sm font-medium">{displayName}</p>
			<div class="mt-1 flex items-center justify-between">
				{#if hasVariants && variants.length > 0}
					<div class="flex items-center gap-1">
						{#each visibleSwatches as v, i (i)}
							<span
								class="h-3.5 w-3.5 rounded-full border border-border/60"
								style:background={v.colorHex || '#d4d4d8'}
							></span>
						{/each}
						{#if overflowCount > 0}
							<span class="text-sm text-muted-foreground">+{overflowCount}</span>
						{/if}
					</div>
				{:else}
					<div></div>
				{/if}
				<div class="text-sm font-medium">
					{displayPrice}
					{#if displayMsrp}
						<span class="ml-1 text-sm font-normal text-muted-foreground line-through"
							>{displayMsrp}</span
						>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
