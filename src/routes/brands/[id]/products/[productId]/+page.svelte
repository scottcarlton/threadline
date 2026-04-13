<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardFooter
	} from '$lib/components/ui/card/index.js';
	import type { Product, ProductVariant, ProductImage } from '$lib/types/database.js';

	let { data } = $props();
	const brand = $derived(data.brand as { id: string; name: string });
	const product = $derived(
		data.product as Product & { product_variants: ProductVariant[]; product_images: ProductImage[] }
	);
	const seasons = $derived(data.seasons as { id: string; name: string }[]);
	const canEdit = $derived(data.membership?.role !== 'guest');
	const velocity = $derived(
		data.velocity as {
			orders30d: number;
			units30d: number;
			revenue30d: number;
			orders90d: number;
			units90d: number;
			revenue90d: number;
		}
	);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const fmtShort = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	// Edit state
	let editing = $state(false);
	let editStyle = $state('');
	let editName = $state('');
	let editDescription = $state('');
	let editWholesale = $state('');
	let editRetail = $state('');
	let editCategory = $state('');
	let editSubcategory = $state('');
	let editSeasonId = $state('');
	let editProductYear = $state<number>(new Date().getFullYear());
	let saveError = $state('');
	let saving = $state(false);

	function startEdit() {
		editStyle = product.style_number;
		editName = product.name;
		editDescription = product.description ?? '';
		editWholesale = String(product.wholesale_price);
		editRetail = product.retail_price ? String(product.retail_price) : '';
		editCategory = product.category ?? '';
		editSubcategory = product.subcategory ?? '';
		editSeasonId = product.season_id ?? '';
		editProductYear = product.product_year ?? new Date().getFullYear();
		editing = true;
	}

	async function handleSave() {
		saving = true;
		saveError = '';
		const { error } = await supabase
			.from('products')
			.update({
				style_number: editStyle,
				name: editName,
				description: editDescription || null,
				wholesale_price: parseFloat(editWholesale) || 0,
				retail_price: parseFloat(editRetail) || null,
				category: editCategory || null,
				subcategory: editSubcategory || null,
				season_id: editSeasonId || null,
				product_year: editProductYear || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', product.id);
		saving = false;
		if (error) {
			saveError = error.message;
			return;
		}
		editing = false;
		invalidateAll();
	}

	async function toggleArchive() {
		await supabase
			.from('products')
			.update({
				archived_at: product.archived_at ? null : new Date().toISOString(),
				is_active: !!product.archived_at,
				updated_at: new Date().toISOString()
			})
			.eq('id', product.id);
		invalidateAll();
	}

	// Variant management
	let addingVariants = $state(false);
	let newColor = $state('');
	let newColorHex = $state('#000000');
	const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
	const numberedSizes = ['0', '2', '4', '6', '8', '10', '12', '14'];
	let selectedNewSizes = $state<Set<string>>(new Set());
	let sizeMode = $state<'letter' | 'number'>('letter');
	let customSize = $state('');
	let savingVariants = $state(false);

	function toggleNewSize(size: string) {
		const next = new Set(selectedNewSizes);
		if (next.has(size)) next.delete(size);
		else next.add(size);
		selectedNewSizes = next;
	}

	function addCustomSize() {
		if (customSize.trim() && !selectedNewSizes.has(customSize.trim())) {
			selectedNewSizes = new Set([...selectedNewSizes, customSize.trim()]);
			customSize = '';
		}
	}

	async function addSizeRun() {
		if (!newColor.trim() && selectedNewSizes.size === 0) return;
		savingVariants = true;

		const sizes = Array.from(selectedNewSizes);
		const variants: { product_id: string; color: string | null; size: string | null }[] = [];

		if (newColor.trim() && sizes.length > 0) {
			for (const size of sizes) {
				variants.push({ product_id: product.id, color: newColor.trim(), size });
			}
		} else if (newColor.trim()) {
			variants.push({ product_id: product.id, color: newColor.trim(), size: null });
		} else if (sizes.length > 0) {
			for (const size of sizes) {
				variants.push({ product_id: product.id, color: null, size });
			}
		}

		if (variants.length > 0) {
			await supabase.from('product_variants').insert(variants);
		}

		savingVariants = false;
		newColor = '';
		newColorHex = '#000000';
		selectedNewSizes = new Set();
		addingVariants = false;
		invalidateAll();
	}

	async function removeVariant(id: string) {
		await supabase.from('product_variants').delete().eq('id', id);
		invalidateAll();
	}

	// Image management
	let uploading = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	async function handleImageUpload() {
		const files = fileInput?.files;
		if (!files || files.length === 0) return;
		uploading = true;
		const formData = new FormData();
		formData.append('file', files[0]);
		await fetch(`/api/products/${product.id}/images`, { method: 'POST', body: formData });
		uploading = false;
		if (fileInput) fileInput.value = '';
		invalidateAll();
	}

	async function deleteImage(imageId: string) {
		await fetch(`/api/products/${product.id}/images`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ imageId })
		});
		invalidateAll();
	}

	async function setPrimaryImage(imageId: string) {
		// Unset all, then set the one
		for (const img of product.product_images) {
			if (img.is_primary) {
				await supabase.from('product_images').update({ is_primary: false }).eq('id', img.id);
			}
		}
		await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId);
		invalidateAll();
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/brands/{brand.id}/products"><LongArrow direction="left" /> Products</Button>
			<h1 class="text-2xl font-bold">{product.style_number}</h1>
			<Badge variant={product.archived_at ? 'destructive' : 'success'}>
				{product.archived_at ? 'Archived' : 'Active'}
			</Badge>
		</div>
		{#if canEdit && !editing}
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={toggleArchive}>
					{product.archived_at ? 'Unarchive' : 'Archive'}
				</Button>
				<Button size="sm" onclick={startEdit}>Edit</Button>
			</div>
		{/if}
	</div>

	<!-- Name + price banner -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<h2 class="text-xl font-semibold">{product.name}</h2>
			{#if product.season_id || product.product_year}
				{@const seasonRow = seasons.find((s) => s.id === product.season_id)}
				<p class="mt-1 text-sm text-muted-foreground">
					{[seasonRow?.name, product.product_year].filter(Boolean).join(' ')}
				</p>
			{/if}
		</div>
		<div class="text-xl font-semibold">{fmt.format(Number(product.wholesale_price))}</div>
	</div>

	<!-- Style Velocity -->
	{#if velocity && (velocity.units30d > 0 || velocity.units90d > 0)}
		<div class="grid gap-4 sm:grid-cols-3">
			<Card>
				<CardContent class="pt-4 pb-4">
					<p class="text-sm font-medium text-muted-foreground">Last 30 Days</p>
					<p class="mt-1 text-2xl font-semibold">
						{velocity.units30d} <span class="text-sm font-normal text-muted-foreground">units</span>
					</p>
					<p class="mt-0.5 text-sm text-muted-foreground">
						{velocity.orders30d} account{velocity.orders30d !== 1 ? 's' : ''} · {fmtShort.format(
							velocity.revenue30d
						)}
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardContent class="pt-4 pb-4">
					<p class="text-sm font-medium text-muted-foreground">Last 90 Days</p>
					<p class="mt-1 text-2xl font-semibold">
						{velocity.units90d} <span class="text-sm font-normal text-muted-foreground">units</span>
					</p>
					<p class="mt-0.5 text-sm text-muted-foreground">
						{velocity.orders90d} account{velocity.orders90d !== 1 ? 's' : ''} · {fmtShort.format(
							velocity.revenue90d
						)}
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardContent class="pt-4 pb-4">
					<p class="text-sm font-medium text-muted-foreground">Velocity</p>
					{@const trend =
						velocity.units30d > 0 && velocity.units90d > 0
							? velocity.units30d / (velocity.units90d / 3)
							: 0}
					<p
						class="mt-1 text-2xl font-semibold {trend >= 1.2
							? 'text-emerald-600'
							: trend <= 0.8
								? 'text-red-600'
								: ''}"
					>
						{trend > 0 ? `${Math.round(trend * 100)}%` : '—'}
					</p>
					<p class="mt-0.5 text-sm text-muted-foreground">
						{trend >= 1.2
							? 'Accelerating'
							: trend <= 0.8
								? 'Slowing'
								: trend > 0
									? 'Steady'
									: 'No data'}
					</p>
				</CardContent>
			</Card>
		</div>
	{/if}

	<!-- Product Details -->
	<Card>
		<CardContent class="pt-6">
			{#if saveError}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{saveError}
				</div>
			{/if}

			{#if editing}
				<form
					id="edit-form"
					onsubmit={(e) => {
						e.preventDefault();
						handleSave();
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-3">
						<div class="space-y-2">
							<Label for="style">Style Number *</Label>
							<Input id="style" bind:value={editStyle} required />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="name">Name *</Label>
							<Input id="name" bind:value={editName} required />
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-4">
						<div class="space-y-2">
							<Label for="wholesale">Wholesale</Label>
							<Input id="wholesale" type="number" step="0.01" bind:value={editWholesale} />
						</div>
						<div class="space-y-2">
							<Label for="retail">Retail</Label>
							<Input id="retail" type="number" step="0.01" bind:value={editRetail} />
						</div>
						<div class="space-y-2">
							<Label for="category">Category</Label>
							<Input id="category" bind:value={editCategory} />
						</div>
						<div class="space-y-2">
							<Label for="season">Season</Label>
							<select
								id="season"
								bind:value={editSeasonId}
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							>
								<option value="">None</option>
								{#each seasons as season}
									<option value={season.id}>{season.name}</option>
								{/each}
							</select>
						</div>
						<div class="space-y-2">
							<Label for="productYear">Year</Label>
							<Input
								id="productYear"
								type="number"
								min="2000"
								max="2100"
								bind:value={editProductYear}
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="desc">Description</Label>
						<textarea
							id="desc"
							bind:value={editDescription}
							rows="3"
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
						></textarea>
					</div>
				</form>
			{:else}
				<dl class="space-y-3 text-sm">
					{#if product.retail_price}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Retail</dt>
							<dd>{fmt.format(Number(product.retail_price))}</dd>
						</div>
					{/if}
					{#if product.category}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Category</dt>
							<dd>{product.category}{product.subcategory ? ` / ${product.subcategory}` : ''}</dd>
						</div>
					{/if}
					{#if product.description}
						<div>
							<dt class="text-muted-foreground">Description</dt>
							<dd class="mt-1 whitespace-pre-wrap">{product.description}</dd>
						</div>
					{/if}
				</dl>
			{/if}
		</CardContent>
		{#if editing}
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (editing = false)}>Cancel</Button>
				<Button type="submit" form="edit-form" disabled={saving}
					>{saving ? 'Saving...' : 'Save'}</Button
				>
			</CardFooter>
		{/if}
	</Card>

	<!-- Variants -->
	<Card>
		<CardHeader>
			<div class="flex items-center justify-between">
				<CardTitle class="text-base">Variants ({product.product_variants?.length ?? 0})</CardTitle>
				{#if canEdit && !addingVariants}
					<Button variant="outline" size="sm" onclick={() => (addingVariants = true)}
						>Add Variants</Button
					>
				{/if}
			</div>
		</CardHeader>
		<CardContent>
			{#if addingVariants}
				<div class="mb-4 space-y-4 rounded-none border border-dashed p-4">
					<!-- Color / Print -->
					<div class="space-y-2">
						<p class="text-sm font-medium">Color or Print</p>
						<p class="text-sm text-muted-foreground">
							Solid colors, prints, or patterns (e.g. Navy, Leopard, Floral Stripe)
						</p>
						<div class="flex items-center gap-3">
							<input
								type="color"
								bind:value={newColorHex}
								class="h-9 w-9 shrink-0 cursor-pointer rounded border-0 p-0"
								title="Pick a swatch color (optional)"
							/>
							<Input
								bind:value={newColor}
								placeholder="e.g. Navy, Leopard Print, Floral"
								class="flex-1"
							/>
						</div>
					</div>

					<!-- Sizes -->
					<div class="space-y-2">
						<p class="text-sm font-medium">Sizes</p>
						<div class="mb-2 flex w-fit gap-1 rounded-lg bg-muted p-1">
							<button
								class="rounded-md px-3 py-1 text-sm font-medium transition-colors {sizeMode ===
								'letter'
									? 'bg-background text-foreground shadow-sm'
									: 'text-muted-foreground'}"
								onclick={() => (sizeMode = 'letter')}>Letter</button
							>
							<button
								class="rounded-md px-3 py-1 text-sm font-medium transition-colors {sizeMode ===
								'number'
									? 'bg-background text-foreground shadow-sm'
									: 'text-muted-foreground'}"
								onclick={() => (sizeMode = 'number')}>Numeric</button
							>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each sizeMode === 'letter' ? commonSizes : numberedSizes as size}
								<button
									class="flex h-9 w-11 items-center justify-center rounded-lg border-2 text-sm font-medium transition-all {selectedNewSizes.has(
										size
									)
										? 'border-primary bg-primary/10 text-primary'
										: 'border-muted text-muted-foreground hover:border-foreground/20'}"
									onclick={() => toggleNewSize(size)}
								>
									{size}
								</button>
							{/each}
							<div class="flex items-center gap-1">
								<input
									type="text"
									bind:value={customSize}
									placeholder="Custom"
									class="h-9 w-20 rounded-lg border-2 border-dashed border-muted bg-background px-2 text-center text-sm focus:border-primary focus:outline-none"
									onkeydown={(e) => {
										if (e.key === 'Enter') addCustomSize();
									}}
								/>
								{#if customSize.trim()}
									<button class="text-xs text-primary" onclick={addCustomSize}>Add</button>
								{/if}
							</div>
						</div>
					</div>

					{#if newColor.trim() && selectedNewSizes.size > 0}
						<p class="text-sm text-muted-foreground">
							This will create <span class="font-medium text-foreground"
								>{selectedNewSizes.size}</span
							>
							variant{selectedNewSizes.size > 1 ? 's' : ''} for {newColor.trim()}
						</p>
					{/if}

					<div class="flex gap-2">
						<Button
							size="sm"
							onclick={addSizeRun}
							disabled={savingVariants || (!newColor.trim() && selectedNewSizes.size === 0)}
						>
							{savingVariants ? 'Adding...' : 'Add Variants'}
						</Button>
						<Button variant="outline" size="sm" onclick={() => (addingVariants = false)}
							>Cancel</Button
						>
					</div>
				</div>
			{/if}

			{#if (product.product_variants?.length ?? 0) === 0 && !addingVariants}
				<p class="text-sm text-muted-foreground">No variants. Add color/size combinations.</p>
			{:else}
				<div class="space-y-2">
					{#each product.product_variants ?? [] as variant}
						<div class="flex items-center justify-between rounded-lg border px-4 py-2.5">
							<div class="flex items-center gap-4 text-sm">
								{#if variant.color}
									<span class="font-medium">{variant.color}</span>
								{/if}
								{#if variant.size}
									<span class="rounded border px-2 py-0.5 text-xs font-medium">{variant.size}</span>
								{/if}
								{#if !variant.color && !variant.size}
									<span class="text-muted-foreground">Default</span>
								{/if}
								{#if variant.sku}
									<span class="text-xs text-muted-foreground">SKU: {variant.sku}</span>
								{/if}
								{#if variant.price_override}
									<span class="text-xs text-muted-foreground"
										>{fmt.format(Number(variant.price_override))}</span
									>
								{/if}
							</div>
							{#if canEdit}
								<button
									class="text-xs text-muted-foreground transition-colors hover:text-destructive"
									onclick={() => removeVariant(variant.id)}>Remove</button
								>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Images -->
	<Card>
		<CardHeader>
			<div class="flex items-center justify-between">
				<CardTitle class="text-base">Images ({product.product_images?.length ?? 0})</CardTitle>
				{#if canEdit}
					<div>
						<input
							type="file"
							accept="image/*"
							bind:this={fileInput}
							onchange={handleImageUpload}
							class="hidden"
						/>
						<Button
							variant="outline"
							size="sm"
							onclick={() => fileInput?.click()}
							disabled={uploading}
						>
							{uploading ? 'Uploading...' : 'Upload Image'}
						</Button>
					</div>
				{/if}
			</div>
		</CardHeader>
		<CardContent>
			{#if (product.product_images?.length ?? 0) === 0}
				<p class="text-sm text-muted-foreground">No images yet.</p>
			{:else}
				<div class="grid grid-cols-3 gap-3">
					{#each (product.product_images ?? []).sort((a, b) => a.sort_order - b.sort_order) as image}
						<div
							class="group relative aspect-square overflow-hidden rounded-lg border {image.is_primary
								? 'ring-2 ring-primary'
								: ''}"
						>
							<img
								src="/api/products/{product.id}/images/{image.id}"
								alt="Product"
								class="h-full w-full object-cover"
							/>
							{#if image.is_primary}
								<span
									class="absolute top-2 left-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
									>Primary</span
								>
							{/if}
							{#if canEdit}
								<div
									class="absolute inset-0 flex items-end justify-center gap-2 bg-black/0 pb-2 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100"
								>
									{#if !image.is_primary}
										<button
											class="rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-900"
											onclick={() => setPrimaryImage(image.id)}>Set Primary</button
										>
									{/if}
									<button
										class="rounded bg-red-500/90 px-2 py-1 text-[11px] font-medium text-white"
										onclick={() => deleteImage(image.id)}>Delete</button
									>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
