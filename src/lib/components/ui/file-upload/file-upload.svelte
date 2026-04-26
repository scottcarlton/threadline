<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		/** Current storage path; `''` means no file uploaded yet. Two-way bound. */
		value: string;
		/** Resolved URL the browser can render. Empty string when no preview. */
		previewUrl?: string;
		/** POST endpoint that accepts FormData with `file` and returns `{ path: string }`. */
		endpoint: string;
		/** `<input accept>` value. Defaults to images. */
		accept?: string;
		/** Visible button label when no file is uploaded yet. */
		uploadLabel?: string;
		/** Visible button label when a file is already uploaded. */
		replaceLabel?: string;
		/** Visible button label for the remove action. */
		removeLabel?: string;
		/** Aria-label for the file picker. */
		ariaLabel?: string;
		/** Called after a successful upload or remove. */
		onChange?: (next: string) => void;
		disabled?: boolean;
		class?: string;
	};

	let {
		value = $bindable(''),
		previewUrl = '',
		endpoint,
		accept = 'image/*',
		uploadLabel = 'Upload',
		replaceLabel = 'Replace',
		removeLabel = 'Remove',
		ariaLabel = 'Upload file',
		onChange,
		disabled = false,
		class: className = ''
	}: Props = $props();

	let inputEl = $state<HTMLInputElement | null>(null);
	let busy = $state(false);
	let error = $state('');

	function pick() {
		inputEl?.click();
	}

	async function handlePicked() {
		const files = inputEl?.files;
		if (!files || files.length === 0) return;
		busy = true;
		error = '';
		try {
			const fd = new FormData();
			fd.append('file', files[0]);
			const res = await fetch(endpoint, { method: 'POST', body: fd });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				error = body.error ?? 'Upload failed';
				return;
			}
			const body = (await res.json()) as { path: string };
			value = body.path;
			onChange?.(body.path);
		} catch {
			error = 'Upload failed';
		} finally {
			busy = false;
			if (inputEl) inputEl.value = '';
		}
	}

	async function handleRemove() {
		if (!value) return;
		busy = true;
		error = '';
		try {
			const res = await fetch(endpoint, { method: 'DELETE' });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				error = body.error ?? 'Remove failed';
				return;
			}
			value = '';
			onChange?.('');
		} catch {
			error = 'Remove failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class={cn('space-y-2', className)}>
	<div class="flex items-center gap-3">
		{#if previewUrl}
			<img src={previewUrl} alt="" class="h-14 w-14 rounded-md border border-input object-cover" />
		{:else}
			<div
				class="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-input text-muted-foreground"
				aria-hidden="true"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v12.75"
					/>
				</svg>
			</div>
		{/if}

		<div class="flex items-center gap-2">
			<Button type="button" variant="outline" disabled={busy || disabled} onclick={pick}>
				{busy ? 'Uploading…' : value ? replaceLabel : uploadLabel}
			</Button>
			{#if value}
				<Button type="button" variant="ghost" disabled={busy || disabled} onclick={handleRemove}>
					{removeLabel}
				</Button>
			{/if}
		</div>

		<input
			bind:this={inputEl}
			type="file"
			{accept}
			class="hidden"
			aria-label={ariaLabel}
			onchange={handlePicked}
		/>
	</div>

	{#if error}
		<p class="text-sm text-destructive">{error}</p>
	{/if}
</div>
