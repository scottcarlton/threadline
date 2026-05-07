<script lang="ts">
	type Props = {
		primaryFile?: File | null;
		hoverFile?: File | null;
		videoFile?: File | null;
		onPrimaryChange: (file: File | null) => void;
		onHoverChange: (file: File | null) => void;
		onVideoChange?: (file: File | null) => void;
	};

	let { primaryFile, hoverFile, videoFile, onPrimaryChange, onHoverChange, onVideoChange }: Props =
		$props();

	const primaryPreview = $derived(primaryFile ? URL.createObjectURL(primaryFile) : null);
	const hoverPreview = $derived(hoverFile ? URL.createObjectURL(hoverFile) : null);

	let primaryInput: HTMLInputElement;
	let hoverInput: HTMLInputElement;
	let videoInput: HTMLInputElement;

	function handleFile(e: Event, role: 'primary' | 'hover') {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		if (role === 'primary') onPrimaryChange(file);
		else onHoverChange(file);
	}

	function handleVideoFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		onVideoChange?.(file);
	}
</script>

<div class="grid grid-cols-2 gap-3">
	<input
		bind:this={primaryInput}
		type="file"
		accept="image/jpeg,image/png,image/webp,image/avif"
		class="hidden"
		onchange={(e) => handleFile(e, 'primary')}
	/>
	<input
		bind:this={hoverInput}
		type="file"
		accept="image/jpeg,image/png,image/webp,image/avif"
		class="hidden"
		onchange={(e) => handleFile(e, 'hover')}
	/>
	<input
		bind:this={videoInput}
		type="file"
		accept="video/mp4,video/quicktime"
		class="hidden"
		onchange={handleVideoFile}
	/>

	<!-- Primary slot -->
	<button
		type="button"
		class="group relative flex aspect-square flex-col items-center justify-center border border-dashed border-border/60 bg-muted transition-colors hover:border-foreground hover:text-foreground {primaryPreview
			? 'border-solid border-border/40'
			: 'text-muted-foreground'}"
		onclick={() => primaryInput.click()}
	>
		<span
			class="absolute top-2 left-2 bg-white/90 px-1.5 py-0.5 font-mono text-sm text-foreground dark:bg-black/90"
			>primary</span
		>
		{#if primaryPreview}
			<img src={primaryPreview} alt="Primary" class="h-full w-full object-cover" />
			<span
				class="absolute right-2 bottom-2 bg-white/95 px-2 py-0.5 font-mono text-sm text-foreground opacity-0 group-hover:opacity-100 dark:bg-black/95"
				>Replace</span
			>
		{:else}
			<span class="text-2xl font-light">+</span>
			<span class="font-mono text-sm">grid image</span>
		{/if}
	</button>

	<!-- Hover slot -->
	<div class="relative">
		<button
			type="button"
			class="group relative flex aspect-square w-full flex-col items-center justify-center border border-dashed border-border/60 bg-muted transition-colors hover:border-foreground hover:text-foreground {hoverPreview
				? 'border-solid border-border/40'
				: 'text-muted-foreground'}"
			onclick={() => hoverInput.click()}
		>
			<span
				class="absolute top-2 left-2 bg-white/90 px-1.5 py-0.5 font-mono text-sm text-foreground dark:bg-black/90"
				>hover</span
			>
			{#if hoverPreview}
				<img src={hoverPreview} alt="Hover" class="h-full w-full object-cover" />
				<span
					class="absolute right-2 bottom-2 bg-white/95 px-2 py-0.5 font-mono text-sm text-foreground opacity-0 group-hover:opacity-100 dark:bg-black/95"
					>Replace</span
				>
			{:else}
				<span class="text-2xl font-light">+</span>
				<span class="font-mono text-sm">hover image</span>
			{/if}
		</button>

		<!-- Video upload button -->
		{#if onVideoChange}
			<button
				type="button"
				class="absolute right-2 bottom-2 z-10 flex items-center gap-1.5 bg-white/95 px-2 py-1 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-white dark:bg-black/95 dark:hover:bg-black"
				onclick={(e) => {
					e.stopPropagation();
					videoInput.click();
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="h-4 w-4"
				>
					<path
						d="M3 19H21V21H3V19ZM13 5.82843V17H11V5.82843L4.92893 11.8995L3.51472 10.4853L12 2L20.4853 10.4853L19.0711 11.8995L13 5.82843Z"
					></path>
				</svg>
				{#if videoFile}
					{videoFile.name.length > 15 ? videoFile.name.slice(0, 12) + '…' : videoFile.name}
				{:else}
					Video
				{/if}
			</button>
		{/if}
	</div>
</div>
<p class="mt-2 text-sm text-muted-foreground">
	JPG, PNG, WebP, or AVIF. Square ratio recommended. Max 5MB each.
	{#if onVideoChange}MP4 or MOV for video. Max 50MB.{/if}
</p>
