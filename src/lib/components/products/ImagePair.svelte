<script lang="ts">
	type Props = {
		primaryFile?: File | null;
		hoverFile?: File | null;
		onPrimaryChange: (file: File | null) => void;
		onHoverChange: (file: File | null) => void;
	};

	let { primaryFile, hoverFile, onPrimaryChange, onHoverChange }: Props = $props();

	const primaryPreview = $derived(primaryFile ? URL.createObjectURL(primaryFile) : null);
	const hoverPreview = $derived(hoverFile ? URL.createObjectURL(hoverFile) : null);

	let primaryInput: HTMLInputElement;
	let hoverInput: HTMLInputElement;

	function handleFile(e: Event, role: 'primary' | 'hover') {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		if (role === 'primary') onPrimaryChange(file);
		else onHoverChange(file);
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
	<button
		type="button"
		class="group relative flex aspect-square flex-col items-center justify-center border border-dashed border-border/60 bg-muted transition-colors hover:border-foreground hover:text-foreground {hoverPreview
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
</div>
<p class="mt-2 text-sm text-muted-foreground">
	JPG, PNG, WebP, or AVIF. Square ratio recommended. Max 5MB each.
</p>
