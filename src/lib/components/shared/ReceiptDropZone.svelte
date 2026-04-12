<script lang="ts">
	type Props = {
		onfiles: (files: File[]) => void;
		accept?: string;
		maxSizeMb?: number;
		multiple?: boolean;
		disabled?: boolean;
		compact?: boolean;
	};

	let {
		onfiles,
		accept = 'image/*,.pdf',
		maxSizeMb = 20,
		multiple = true,
		disabled = false,
		compact = false
	}: Props = $props();

	let fileInput: HTMLInputElement | undefined = $state();
	let dragging = $state(false);
	let error = $state('');

	function validateAndEmit(fileList: FileList | null | undefined) {
		if (!fileList || fileList.length === 0) return;
		error = '';

		const maxBytes = maxSizeMb * 1024 * 1024;
		const valid: File[] = [];

		for (const file of Array.from(fileList)) {
			if (file.size > maxBytes) {
				error = `${file.name} exceeds ${maxSizeMb}MB limit`;
				continue;
			}
			valid.push(file);
		}

		if (valid.length > 0) {
			onfiles(multiple ? valid : [valid[0]]);
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (disabled) return;
		validateAndEmit(e.dataTransfer?.files);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (!disabled) dragging = true;
	}

	function handleDragLeave() {
		dragging = false;
	}

	function handleInputChange() {
		validateAndEmit(fileInput?.files);
		if (fileInput) fileInput.value = '';
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="cursor-pointer border-2 border-dashed transition-colors {dragging ? 'border-foreground bg-accent/50' : 'border-muted-foreground/20 hover:border-muted-foreground/40'} {compact ? 'p-4' : 'p-6'} {disabled ? 'pointer-events-none opacity-50' : ''}"
	onclick={() => fileInput?.click()}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<div class="flex flex-col items-center gap-2 text-center">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
		</svg>
		<p class="text-sm text-muted-foreground">
			{compact ? 'Drop files or click to upload' : 'Drag and drop receipts here, or click to browse'}
		</p>
		<p class="text-sm text-muted-foreground/60">Images and PDFs up to {maxSizeMb}MB</p>
	</div>

	{#if error}
		<p class="mt-2 text-center text-sm text-destructive">{error}</p>
	{/if}
</div>

<input
	type="file"
	bind:this={fileInput}
	onchange={handleInputChange}
	{accept}
	{multiple}
	class="hidden"
/>
