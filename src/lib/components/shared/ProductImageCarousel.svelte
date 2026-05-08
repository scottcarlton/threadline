<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	type ProductImage = {
		id: string;
		is_primary: boolean;
		sort_order?: number | null;
		role?: 'primary' | 'hover' | 'video' | null;
		variant_id?: string | null;
	};

	type Props = {
		productId: string;
		images: ProductImage[];
		alt: string;
		aspect?: string;
		activeImageId?: string | null;
		onselect?: (imageId: string) => void;
		overlay?: import('svelte').Snippet;
	};

	/* eslint-disable @typescript-eslint/no-unused-vars */
	let {
		productId,
		images,
		alt,
		aspect = 'aspect-square',
		activeImageId,
		onselect,
		overlay
	}: Props = $props();
	/* eslint-enable @typescript-eslint/no-unused-vars */

	const variantGroups = $derived(() => {
		const groups = new SvelteMap<
			string,
			{ primary: ProductImage | null; hover: ProductImage | null; video: ProductImage | null }
		>();

		for (const img of images) {
			const key = img.variant_id ?? '__product__';
			if (!groups.has(key)) groups.set(key, { primary: null, hover: null, video: null });
			const group = groups.get(key)!;

			if (img.role === 'primary') {
				group.primary = img;
			} else if (img.role === 'hover') {
				group.hover = img;
			} else if (img.role === 'video') {
				group.video = img;
			} else if (img.is_primary && !group.primary) {
				group.primary = img;
			} else if (!group.hover) {
				group.hover = img;
			}
		}

		return [...groups.values()]
			.filter((g) => g.primary)
			.sort((a, b) => {
				const aIsPrimary = a.primary?.is_primary ? 1 : 0;
				const bIsPrimary = b.primary?.is_primary ? 1 : 0;
				return bIsPrimary - aIsPrimary;
			});
	});

	let activeGroupIndex = $state(0);
	let hovered = $state(false);

	const activeGroup = $derived(variantGroups()[activeGroupIndex] ?? variantGroups()[0] ?? null);

	const showVideo = $derived(hovered && activeGroup?.video);
	const activeImage = $derived(
		activeGroup
			? hovered && !activeGroup.video && activeGroup.hover
				? activeGroup.hover
				: activeGroup.primary
			: null
	);

	const thumbnails = $derived(variantGroups().map((g) => g.primary!));
	const showThumbnails = $derived(thumbnails.length > 1);
</script>

<div>
	<!-- Main image -->
	<div
		class="relative w-full overflow-hidden bg-muted {aspect}"
		role="group"
		aria-label="Product image"
		onmouseenter={() => (hovered = true)}
		onmouseleave={() => (hovered = false)}
	>
		{#if showVideo && activeGroup?.video}
			<video
				src="/api/products/{productId}/images/{activeGroup.video.id}"
				class="absolute inset-0 h-full w-full object-cover"
				autoplay
				loop
				muted
				playsinline
			></video>
		{:else if activeImage}
			<img
				src="/api/products/{productId}/images/{activeImage.id}"
				{alt}
				class="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
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

		{#if overlay}
			{@render overlay()}
		{/if}
	</div>

	<!-- Variant thumbnails — left-aligned strip below the image -->
	{#if showThumbnails}
		<div class="mt-1.5 flex gap-1 px-4">
			{#each thumbnails as thumb, i (thumb.id)}
				<div
					class="h-12 w-12 shrink-0 cursor-pointer overflow-hidden transition-all"
					role="img"
					aria-label="View color {i + 1}"
					onmouseenter={() => {
						activeGroupIndex = i;
						if (onselect && thumb.id) onselect(thumb.id);
					}}
				>
					<img
						src="/api/products/{productId}/images/{thumb.id}"
						alt=""
						class="h-full w-full object-cover"
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>
