<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();

	let cameraInput: HTMLInputElement | undefined = $state();
	let libraryInput: HTMLInputElement | undefined = $state();
	let uploading = $state(false);
	let uploaded = $state<string[]>([]);
	let error = $state('');
	let expired = $state(false);

	// Check expiry
	$effect(() => {
		const check = () => {
			if (new Date(data.expiresAt) < new Date()) {
				expired = true;
			}
		};
		check();
		const interval = setInterval(check, 5000);
		return () => clearInterval(interval);
	});

	// Time remaining
	let timeLeft = $state('');
	$effect(() => {
		const update = () => {
			const diff = new Date(data.expiresAt).getTime() - Date.now();
			if (diff <= 0) {
				timeLeft = 'Expired';
				expired = true;
				return;
			}
			const mins = Math.floor(diff / 60000);
			const secs = Math.floor((diff % 60000) / 1000);
			timeLeft = `${mins}:${secs.toString().padStart(2, '0')}`;
		};
		update();
		const interval = setInterval(update, 1000);
		return () => clearInterval(interval);
	});

	async function handleFile(fileList: FileList | null) {
		if (!fileList || fileList.length === 0 || expired) return;
		error = '';
		uploading = true;

		for (const file of Array.from(fileList)) {
			if (file.size > 20 * 1024 * 1024) {
				error = `${file.name} exceeds 20MB limit`;
				continue;
			}

			const formData = new FormData();
			formData.append('file', file);
			formData.append('token', data.token);

			try {
				const res = await fetch('/api/upload/receipt', {
					method: 'POST',
					body: formData
				});

				if (!res.ok) {
					const json = await res.json();
					error = json.error || 'Upload failed';
				} else {
					uploaded = [...uploaded, file.name];
				}
			} catch {
				error = 'Upload failed. Check your connection.';
			}
		}

		uploading = false;
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-background p-4">
	<div class="w-full max-w-sm space-y-6 text-center">
		<div>
			{#if data.orgName}
				<p class="text-sm text-muted-foreground">{data.orgName}</p>
			{/if}
			<h1 class="mt-1 text-xl font-semibold">Upload Receipt</h1>
			<p class="mt-1 text-sm text-muted-foreground">{data.expenseNumber}</p>
			{#if data.expenseDescription}
				<p class="mt-0.5 text-sm text-muted-foreground">{data.expenseDescription}</p>
			{/if}
		</div>

		{#if expired}
			<div class="space-y-3">
				<p class="text-sm text-destructive">This upload link has expired.</p>
				<p class="text-sm text-muted-foreground">Generate a new QR code from the expense page.</p>
			</div>
		{:else}
			<div class="space-y-3">
				<Button class="w-full" size="lg" onclick={() => cameraInput?.click()} disabled={uploading}>
					{#if uploading}
						Uploading...
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 -ml-1 h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
							/>
						</svg>
						Take Photo
					{/if}
				</Button>

				<Button
					class="w-full"
					variant="outline"
					size="lg"
					onclick={() => libraryInput?.click()}
					disabled={uploading}
				>
					Choose from Library
				</Button>
			</div>

			<p class="text-sm text-muted-foreground">Link expires in {timeLeft}</p>
		{/if}

		{#if error}
			<p class="text-sm text-destructive">{error}</p>
		{/if}

		{#if uploaded.length > 0}
			<div class="space-y-1.5">
				<p class="text-sm font-medium">
					{uploaded.length} receipt{uploaded.length !== 1 ? 's' : ''} uploaded
				</p>
				{#each uploaded as name, i (i)}
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 text-green-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						{name}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<input
	type="file"
	bind:this={cameraInput}
	onchange={(e) => handleFile((e.target as HTMLInputElement).files)}
	accept="image/*"
	capture="environment"
	class="hidden"
/>

<input
	type="file"
	bind:this={libraryInput}
	onchange={(e) => handleFile((e.target as HTMLInputElement).files)}
	accept="image/*,.pdf"
	class="hidden"
/>
