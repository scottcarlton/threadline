<script lang="ts">
	type ProductImage = {
		id: string;
		is_primary: boolean;
		sort_order?: number | null;
	};

	type Props = {
		productId: string;
		images: ProductImage[];
		alt: string;
		aspect?: string;
		activeImageId?: string | null;
		onselect?: (imageId: string) => void;
	};

	let {
		productId,
		images,
		alt,
		aspect = 'aspect-[4/3]',
		activeImageId = null,
		onselect
	}: Props = $props();

	const sorted = $derived(
		[...images].sort((a, b) => {
			if (a.is_primary && !b.is_primary) return -1;
			if (!a.is_primary && b.is_primary) return 1;
			return (a.sort_order ?? 0) - (b.sort_order ?? 0);
		})
	);

	const hasMultiple = $derived(sorted.length > 1);

	let activeIndex = $state(0);
	let hovered = $state(false);

	$effect(() => {
		if (!sorted.length) return;
		if (activeImageId) {
			const idx = sorted.findIndex((img) => img.id === activeImageId);
			activeIndex = idx >= 0 ? idx : 0;
		} else {
			activeIndex = 0;
		}
	});

	function setActive(index: number) {
		activeIndex = index;
		onselect?.(sorted[index].id);
	}

	function prev(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		setActive((activeIndex - 1 + sorted.length) % sorted.length);
	}

	function next(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		setActive((activeIndex + 1) % sorted.length);
	}

	function goTo(e: MouseEvent, index: number) {
		e.preventDefault();
		e.stopPropagation();
		setActive(index);
	}
</script>

<div
	class="relative h-full w-full overflow-hidden bg-muted {aspect}"
	role="group"
	aria-label="Product images"
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
>
	{#if sorted.length > 0}
		{#each sorted as image, i (image.id)}
			{#if i === activeIndex}
				<img
					src="/api/products/{productId}/images/{image.id}"
					{alt}
					class="absolute inset-0 h-full w-full object-cover"
				/>
			{/if}
		{/each}
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

	{#if hasMultiple}
		<!-- Left/right arrows — desktop hover only -->
		<button
			type="button"
			class="absolute top-1/2 left-2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-sm transition-opacity dark:bg-black/70 {hovered
				? 'sm:flex'
				: ''} h-8 w-8"
			aria-label="Previous image"
			onclick={prev}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
			</svg>
		</button>
		<button
			type="button"
			class="absolute top-1/2 right-2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-sm transition-opacity dark:bg-black/70 {hovered
				? 'sm:flex'
				: ''} h-8 w-8"
			aria-label="Next image"
			onclick={next}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
			</svg>
		</button>

		<!-- Thumbnails — always visible -->
		<div class="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
			{#each sorted as image, i (image.id)}
				<button
					type="button"
					class="h-10 w-10 overflow-hidden rounded-sm border-2 transition-all {i === activeIndex
						? 'border-white shadow-md'
						: 'border-transparent opacity-70 hover:opacity-100'}"
					aria-label="View image {i + 1}"
					onclick={(e) => goTo(e, i)}
				>
					<img
						src="/api/products/{productId}/images/{image.id}"
						alt=""
						class="h-full w-full object-cover"
					/>
				</button>
			{/each}
		</div>
	{/if}
</div>
