<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import type { Brand, BrandAsset } from '$lib/types/database.js';
	import { entityContext } from '$lib/stores/entityContext.js';

	let { data } = $props();
	const brand = $derived(data.brand as Brand);

	$effect(() => {
		const b = brand;
		entityContext.set({
			type: 'brand',
			id: b.id,
			summary: `Brand: ${b.name} | Commission: ${b.commission_rate}% | Products: ${data.productCount ?? 0}`
		});
		return () => entityContext.set({ type: null, id: null, summary: null });
	});
	const brandAssets = $derived((data.brandAssets ?? []) as BrandAsset[]);
	const productCount = $derived(data.productCount as number);
	const expenseSummary = $derived(data.expenseSummary as { total: number; pendingCount: number; pendingAmount: number });
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
	const canEdit = $derived(
		data.membership?.role === 'admin' ||
		data.membership?.role === 'owner' ||
		data.membership?.role === 'member'
	);
	const isAdmin = $derived(
		data.membership?.role === 'admin' ||
		data.membership?.role === 'owner'
	);

	let editing = $state(false);
	let name = $state('');
	let contactFirstName = $state('');
	let contactLastName = $state('');
	let contactEmail = $state('');
	let contactPhone = $state('');
	let website = $state('');
	let commissionRate = $state('');
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	// Resources section state
	let uploadCategory = $state('Lookbook');
	let uploading = $state(false);
	let uploadError = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	const categories = ['Lookbook', 'Linesheet', 'Order Form Template', 'Marketing', 'Other'] as const;

	const categoryColors: Record<string, string> = {
		'Lookbook': 'bg-blue-100 text-blue-800',
		'Linesheet': 'bg-indigo-100 text-indigo-800',
		'Order Form Template': 'bg-amber-100 text-amber-800',
		'Marketing': 'bg-emerald-100 text-emerald-800',
		'Other': 'bg-gray-100 text-gray-800'
	};

	function formatFileSize(bytes: number | null): string {
		if (!bytes) return '—';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function fileIcon(mimeType: string | null): 'pdf' | 'image' | 'doc' {
		if (!mimeType) return 'doc';
		if (mimeType === 'application/pdf') return 'pdf';
		if (mimeType.startsWith('image/')) return 'image';
		return 'doc';
	}

	async function handleFileSelect() {
		const files = fileInput?.files;
		if (!files || files.length === 0) return;

		uploading = true;
		uploadError = '';

		const file = files[0];
		const formData = new FormData();
		formData.append('file', file);
		formData.append('category', uploadCategory);

		try {
			const res = await fetch(`/api/brands/${brand.id}/assets`, {
				method: 'POST',
				body: formData
			});

			if (!res.ok) {
				const json = await res.json().catch(() => ({}));
				uploadError = json.error ?? 'Upload failed';
			} else {
				invalidateAll();
			}
		} catch {
			uploadError = 'Upload failed';
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function handleDeleteAsset(assetId: string) {
		try {
			const res = await fetch(`/api/brands/${brand.id}/assets`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assetId })
			});

			if (res.ok) {
				invalidateAll();
			}
		} catch {
			// silent
		}
	}

	async function handleDownloadAsset(asset: BrandAsset) {
		try {
			const { data: signedData } = await supabase.storage
				.from('brand-assets')
				.createSignedUrl(asset.file_path, 60);

			if (signedData?.signedUrl) {
				const a = document.createElement('a');
				a.href = signedData.signedUrl;
				a.download = asset.name;
				a.click();
			}
		} catch {
			// silent
		}
	}

	function startEdit() {
		name = brand.name;
		contactFirstName = brand.contact_first_name ?? '';
		contactLastName = brand.contact_last_name ?? '';
		contactEmail = brand.contact_email ?? '';
		contactPhone = brand.contact_phone ?? '';
		website = brand.website ?? '';
		commissionRate = String(brand.commission_rate ?? 0);
		notes = brand.notes ?? '';
		editing = true;
	}

	async function handleSave() {
		error = '';
		loading = true;

		const { error: err } = await supabase
			.from('brands')
			.update({
				name,
				contact_first_name: contactFirstName || null,
				contact_last_name: contactLastName || null,
				contact_email: contactEmail || null,
				contact_phone: contactPhone || null,
				website: website || null,
				commission_rate: parseFloat(commissionRate) || 0,
				notes: notes || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', brand.id);

		loading = false;
		if (err) {
			error = err.message;
		} else {
			editing = false;
			invalidateAll();
		}
	}

	async function toggleActive() {
		await supabase
			.from('brands')
			.update({ is_active: !brand.is_active, updated_at: new Date().toISOString() })
			.eq('id', brand.id);
		invalidateAll();
	}

	async function toggleArchive() {
		await supabase
			.from('brands')
			.update({
				archived_at: brand.archived_at ? null : new Date().toISOString(),
				is_active: !!brand.archived_at,
				updated_at: new Date().toISOString()
			})
			.eq('id', brand.id);
		invalidateAll();
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/brands">← Back</Button>
			<h1 class="text-3xl">{brand.name}</h1>
			<Badge variant={brand.archived_at ? 'destructive' : brand.is_active ? 'success' : 'secondary'}>
				{brand.archived_at ? 'Archived' : brand.is_active ? 'Active' : 'Inactive'}
			</Badge>
		</div>
		{#if canEdit && !editing}
			<div class="flex gap-2">
				{#if isAdmin}
					<Button variant="outline" size="sm" onclick={toggleArchive}>
						{brand.archived_at ? 'Unarchive' : 'Archive'}
					</Button>
				{/if}
				<Button size="sm" onclick={startEdit}>Edit</Button>
			</div>
		{/if}
	</div>

	<div class="grid gap-6 lg:grid-cols-[1fr_400px]">
	<!-- Left column: Details + Products -->
	<div class="space-y-6">
	<Card>
		<CardContent class="pt-6">
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			{#if editing}
				<form id="edit-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
					<div class="space-y-2">
						<Label for="name">Brand name *</Label>
						<Input id="name" bind:value={name} required />
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="contact-first-name">First name</Label>
							<Input id="contact-first-name" bind:value={contactFirstName} />
						</div>
						<div class="space-y-2">
							<Label for="contact-last-name">Last name</Label>
							<Input id="contact-last-name" bind:value={contactLastName} />
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="contact-email">Contact email</Label>
							<Input id="contact-email" type="email" bind:value={contactEmail} />
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="contact-phone">Phone</Label>
							<Input id="contact-phone" bind:value={contactPhone} />
						</div>
						<div class="space-y-2">
							<Label for="website">Website</Label>
							<Input id="website" bind:value={website} />
						</div>
					</div>
					{#if isAdmin}
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="commission-rate">Commission Rate (%)</Label>
								<Input id="commission-rate" type="number" step="0.01" min="0" max="100" bind:value={commissionRate} />
							</div>
						</div>
					{/if}
					<div class="space-y-2">
						<Label for="notes">Notes</Label>
						<textarea
							id="notes"
							bind:value={notes}
							rows="3"
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						></textarea>
					</div>
				</form>
			{:else}
				<dl class="space-y-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Contact Name</dt>
							<dd class="mt-1">{[brand.contact_first_name, brand.contact_last_name].filter(Boolean).join(' ') || '—'}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Email</dt>
							<dd class="mt-1">{brand.contact_email ?? '—'}</dd>
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Phone</dt>
							<dd class="mt-1">{brand.contact_phone ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Website</dt>
							<dd class="mt-1">
								{#if brand.website}
									<a href={brand.website} target="_blank" class="text-primary hover:underline">{brand.website}</a>
								{:else}
									—
								{/if}
							</dd>
						</div>
					</div>
					{#if isAdmin}
						<div class="grid gap-4 sm:grid-cols-2">
							<div>
								<dt class="text-sm font-medium text-muted-foreground">Commission Rate</dt>
								<dd class="mt-1">{brand.commission_rate ?? 0}%</dd>
							</div>
						</div>
					{/if}
					{#if brand.notes}
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Notes</dt>
							<dd class="mt-1 whitespace-pre-wrap">{brand.notes}</dd>
						</div>
					{/if}
				</dl>
			{/if}
		</CardContent>
		{#if editing}
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (editing = false)}>Cancel</Button>
				<Button type="submit" form="edit-form" disabled={loading}>
					{loading ? 'Saving...' : 'Save Changes'}
				</Button>
			</CardFooter>
		{/if}
	</Card>

	<!-- Products -->
	<Card>
		<CardContent class="pt-5 pb-5">
			<a href="/brands/{brand.id}/products" class="flex items-center justify-between group">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium group-hover:underline">Product Catalog</p>
						<p class="text-sm text-muted-foreground">{productCount > 0 ? `${productCount} product${productCount !== 1 ? 's' : ''}` : 'No products yet'}</p>
					</div>
				</div>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
				</svg>
			</a>
		</CardContent>
	</Card>

	<!-- Expenses -->
	<Card>
		<CardContent class="pt-5 pb-5">
			<a href="/expenses?brand={brand.id}" class="flex items-center justify-between group">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium group-hover:underline">Expenses</p>
						<p class="text-sm text-muted-foreground">
							{#if expenseSummary.pendingCount > 0}
								{expenseSummary.pendingCount} pending ({fmt.format(expenseSummary.pendingAmount)})
							{:else if expenseSummary.total > 0}
								{expenseSummary.total} expense{expenseSummary.total !== 1 ? 's' : ''}
							{:else}
								No expenses yet
							{/if}
						</p>
					</div>
				</div>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
				</svg>
			</a>
		</CardContent>
	</Card>

	</div>

	<!-- Right sidebar: Resources -->
	<div>
	<Card>
		<CardHeader>
			<CardTitle class="text-base">Resources</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Upload area -->
			{#if canEdit}
				<div class="space-y-3">
					<div class="flex items-center gap-3">
						<select
							bind:value={uploadCategory}
							class="h-9 rounded-none border border-input bg-background px-3 text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
						>
							{#each categories as cat}
								<option value={cat}>{cat}</option>
							{/each}
						</select>
						<input
							type="file"
							bind:this={fileInput}
							onchange={handleFileSelect}
							class="hidden"
						/>
						<button
							type="button"
							class="flex h-9 cursor-pointer items-center gap-2 rounded-none border border-dashed border-input bg-background px-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
							onclick={() => fileInput?.click()}
							disabled={uploading}
						>
							{#if uploading}
								<div class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"></div>
								Uploading...
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
								</svg>
								Upload file
							{/if}
						</button>
					</div>
					{#if uploadError}
						<p class="text-sm text-destructive">{uploadError}</p>
					{/if}
				</div>
			{/if}

			<!-- Asset list -->
			{#if brandAssets.length === 0}
				<p class="text-sm text-muted-foreground">No resources uploaded yet.</p>
			{:else}
				<div class="divide-y rounded-none border">
					{#each brandAssets as asset}
						<div class="flex items-center gap-3 px-4 py-3">
							<!-- File icon -->
							<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
								{#if fileIcon(asset.mime_type) === 'pdf'}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
									</svg>
								{:else if fileIcon(asset.mime_type) === 'image'}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
									</svg>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
									</svg>
								{/if}
							</div>

							<!-- File info -->
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{asset.name}</p>
								<p class="text-sm text-muted-foreground">{formatFileSize(asset.file_size)}</p>
							</div>

							<!-- Category badge -->
							<span class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium {categoryColors[asset.category] ?? categoryColors['Other']}">
								{asset.category}
							</span>

							<!-- Actions -->
							<div class="flex shrink-0 gap-1">
								<button
									type="button"
									class="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									onclick={() => handleDownloadAsset(asset)}
									aria-label="Download {asset.name}"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
									</svg>
								</button>
								{#if canEdit}
									<button
										type="button"
										class="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
										onclick={() => handleDeleteAsset(asset.id)}
										aria-label="Delete {asset.name}"
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>
	</div>
	</div>
</div>
