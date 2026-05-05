<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { SvelteMap } from 'svelte/reactivity';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import type { Product, ProductVariant, ProductImage } from '$lib/types/database.js';
	import StockPill from '$lib/components/inventory/StockPill.svelte';
	import VariantStockEditor from '$lib/components/inventory/VariantStockEditor.svelte';
	import { deriveStockStatus } from '$lib/inventory/status';

	let { data } = $props();
	const product = $derived(
		data.product as Product & {
			product_variants: ProductVariant[];
			product_images: ProductImage[];
			seasons: { name?: string } | { name?: string }[] | null;
		}
	);
	const seasons = $derived(data.seasons as { id: string; name: string }[]);
	// Group images by variant for the thumbnail strip
	const variantImageGroups = $derived(() => {
		const groups = new SvelteMap<
			string,
			{ primary: ProductImage | null; hover: ProductImage | null }
		>();
		for (const img of product.product_images ?? []) {
			const key = img.variant_id ?? '__product__';
			if (!groups.has(key)) groups.set(key, { primary: null, hover: null });
			const group = groups.get(key)!;
			if (img.role === 'primary') group.primary = img;
			else if (img.role === 'hover') group.hover = img;
			else if (img.is_primary && !group.primary) group.primary = img;
			else if (!group.hover) group.hover = img;
		}
		return [...groups.values()]
			.filter((g) => g.primary)
			.sort((a, b) => {
				const ap = a.primary?.is_primary ? 1 : 0;
				const bp = b.primary?.is_primary ? 1 : 0;
				return bp - ap;
			});
	});

	let activeGroupIndex = $state(0);
	let selectedSubImage = $state<ProductImage | null>(null);

	const activeGroup = $derived(
		variantImageGroups()[activeGroupIndex] ?? variantImageGroups()[0] ?? null
	);
	const activeImage = $derived(
		selectedSubImage ?? activeGroup?.primary ?? product.product_images?.[0] ?? null
	);

	$effect(() => {
		void activeGroupIndex;
		selectedSubImage = null;
	});
	const variantThumbnails = $derived(variantImageGroups().map((g) => g.primary!));

	const canEdit = $derived(data.membership?.role !== 'guest');
	const canEditStock = $derived(
		canEdit &&
			product.ats &&
			product.organization_id === data.organization?.id &&
			['admin', 'owner', 'member'].includes(data.membership?.role ?? '')
	);
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
	let editAts = $state(false);
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
		editAts = product.ats ?? false;
		editing = true;
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
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
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
	async function deleteImage(imageId: string) {
		await fetch(`/api/products/${product.id}/images`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ imageId })
		});
		selectedSubImage = null;
		invalidateAll();
	}

	let replaceInput: HTMLInputElement | undefined = $state();
	let replacingImageId = $state<string | null>(null);

	function startReplace(imageId: string) {
		replacingImageId = imageId;
		replaceInput?.click();
	}

	async function handleReplace() {
		const files = replaceInput?.files;
		if (!files || files.length === 0 || !replacingImageId) return;
		const old = product.product_images.find((i) => i.id === replacingImageId);
		const formData = new FormData();
		formData.append('file', files[0]);
		if (old?.variant_id) formData.append('variant_id', old.variant_id);
		if (old?.role) formData.append('role', old.role);
		await fetch(`/api/products/${product.id}/images`, { method: 'POST', body: formData });
		await fetch(`/api/products/${product.id}/images`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ imageId: replacingImageId })
		});
		replacingImageId = null;
		selectedSubImage = null;
		if (replaceInput) replaceInput.value = '';
		invalidateAll();
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<Button variant="ghost" size="sm" href="/products">
			<LongArrow direction="left" /> Products
		</Button>
		{#if canEdit && !editing}
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={toggleArchive}>
					{product.archived_at ? 'Unarchive' : 'Archive'}
				</Button>
				<Button size="sm" onclick={startEdit}>Edit</Button>
			</div>
		{/if}
	</div>

	{#snippet metaBanner()}
		<div class="flex items-center justify-between gap-4">
			<div>
				<div class="mb-1 flex items-center gap-2">
					<span class="font-mono text-sm text-muted-foreground">{product.style_number}</span>
					<Badge variant={product.archived_at ? 'destructive' : 'success'}>
						{product.archived_at ? 'Archived' : 'Active'}
					</Badge>
				</div>
				<h2 class="text-xl font-semibold">{product.name}</h2>
				{#if product.season_id || product.product_year || product.category}
					{@const seasonJoin = product.seasons as { name?: string } | { name?: string }[] | null}
					{@const seasonName = Array.isArray(seasonJoin) ? seasonJoin[0]?.name : seasonJoin?.name}
					{@const seasonYear = [seasonName, product.product_year].filter(Boolean).join(' ')}
					<div class="mt-1 flex items-center gap-2">
						{#if seasonYear}
							<span class="text-sm text-muted-foreground">{seasonYear}</span>
						{/if}
						{#if product.category}
							<Badge variant="secondary"
								>{product.category}{product.subcategory ? ` / ${product.subcategory}` : ''}</Badge
							>
						{/if}
					</div>
				{/if}
			</div>
			<div class="shrink-0 text-right">
				<p class="text-sm text-muted-foreground">Wholesale</p>
				<p class="text-xl font-semibold">{fmt.format(Number(product.wholesale_price))}</p>
				{#if product.retail_price}
					<p class="text-sm text-muted-foreground">
						Retail — {fmt.format(Number(product.retail_price))}
					</p>
				{/if}
			</div>
		</div>
	{/snippet}

	<!-- Mobile: meta banner above image. -->
	<div class="mb-6 lg:hidden">
		{@render metaBanner()}
	</div>

	<div class="grid gap-6 min-[960px]:grid-cols-[1fr_1fr] lg:grid-cols-[480px_1fr]">
		<!-- Left: primary image + variant thumbnails -->
		<div class="lg:sticky lg:top-6 lg:self-start">
			<div class="group/main relative aspect-[4/5] w-full overflow-hidden bg-muted">
				{#if activeImage}
					<img
						src={`/api/products/${product.id}/images/${activeImage.id}`}
						alt={product.name}
						class="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
					/>
					{#if canEdit && !(activeGroup?.primary && activeGroup?.hover)}
						<div
							class="absolute inset-0 flex items-end justify-center gap-2 pb-4 opacity-0 transition-all group-hover/main:opacity-100"
						>
							<button
								class="rounded bg-white/90 px-2.5 py-1 text-sm font-medium text-foreground"
								onclick={() => startReplace(activeImage!.id)}>Replace</button
							>
							<button
								class="rounded bg-red-500/90 px-2.5 py-1 text-sm font-medium text-white"
								onclick={() => deleteImage(activeImage!.id)}>Remove</button
							>
						</div>
					{/if}
				{:else}
					<div class="flex h-full w-full items-center justify-center text-muted-foreground">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							class="h-16 w-16 opacity-40"
						>
							<rect x="3" y="3" width="18" height="18" rx="2" />
							<circle cx="8.5" cy="8.5" r="1.5" />
							<path d="M21 15l-5-5L5 21" />
						</svg>
					</div>
				{/if}
			</div>

			<input
				bind:this={replaceInput}
				type="file"
				accept="image/jpeg,image/png,image/webp,image/avif"
				class="hidden"
				onchange={handleReplace}
			/>
			{#if activeGroup && activeGroup.primary && activeGroup.hover}
				<div class="mt-2 grid grid-cols-2 gap-2">
					{#if activeGroup.primary}
						<div
							role="button"
							tabindex="-1"
							class="group/img relative aspect-square overflow-hidden bg-muted"
							onmouseenter={() => (selectedSubImage = activeGroup.primary)}
						>
							<img
								src="/api/products/{product.id}/images/{activeGroup.primary.id}"
								alt="{product.name} — primary"
								class="h-full w-full object-cover"
							/>
							{#if canEdit}
								<div
									class="absolute inset-0 flex items-end justify-center gap-2 pb-3 opacity-0 transition-all group-hover/img:opacity-100"
								>
									<button
										class="rounded bg-white/90 px-2.5 py-1 text-sm font-medium text-foreground"
										onclick={() => startReplace(activeGroup.primary!.id)}>Replace</button
									>
									<button
										class="rounded bg-red-500/90 px-2.5 py-1 text-sm font-medium text-white"
										onclick={() => deleteImage(activeGroup.primary!.id)}>Remove</button
									>
								</div>
							{/if}
						</div>
					{/if}
					{#if activeGroup.hover}
						<div
							role="button"
							tabindex="-1"
							class="group/img relative aspect-square overflow-hidden bg-muted"
							onmouseenter={() => (selectedSubImage = activeGroup.hover)}
						>
							<img
								src="/api/products/{product.id}/images/{activeGroup.hover.id}"
								alt="{product.name} — hover"
								class="h-full w-full object-cover"
							/>
							{#if canEdit}
								<div
									class="absolute inset-0 flex items-end justify-center gap-2 pb-3 opacity-0 transition-all group-hover/img:opacity-100"
								>
									<button
										class="rounded bg-white/90 px-2.5 py-1 text-sm font-medium text-foreground"
										onclick={() => startReplace(activeGroup.hover!.id)}>Replace</button
									>
									<button
										class="rounded bg-red-500/90 px-2.5 py-1 text-sm font-medium text-white"
										onclick={() => deleteImage(activeGroup.hover!.id)}>Remove</button
									>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right: details column -->
		<div class="min-w-0 space-y-6">
			<!-- Desktop: meta banner stays in the right column -->
			<div class="hidden lg:block">
				{@render metaBanner()}
			</div>

			<!-- Variant thumbnails -->
			{#if variantThumbnails.length > 1}
				<div class="flex gap-1.5">
					{#each variantThumbnails as thumb, i (thumb.id)}
						<button
							type="button"
							class="relative h-16 w-16 shrink-0 overflow-hidden transition-all"
							onclick={() => (activeGroupIndex = i)}
						>
							<img
								src="/api/products/{product.id}/images/{thumb.id}"
								alt=""
								class="h-full w-full object-cover"
							/>
							{#if i === activeGroupIndex}
								<span class="pointer-events-none absolute inset-0 border-[3px] border-black/70"
								></span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Style Velocity -->
			{#if velocity && (velocity.units30d > 0 || velocity.units90d > 0)}
				<div class="grid gap-4 sm:grid-cols-3">
					<Card>
						<CardContent class="pt-4 pb-4">
							<p class="text-sm font-medium text-muted-foreground">Last 30 Days</p>
							<p class="mt-1 text-2xl font-semibold">
								{velocity.units30d}
								<span class="text-sm font-normal text-muted-foreground">units</span>
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
								{velocity.units90d}
								<span class="text-sm font-normal text-muted-foreground">units</span>
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
			{#if editing || product.retail_price || product.description}
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
								onsubmit={async (e) => {
									e.preventDefault();
									saving = true;
									saveError = '';
									const fd = new FormData(e.currentTarget as HTMLFormElement);
									try {
										const res = await fetch('?/save', { method: 'POST', body: fd });
										if (!res.ok) {
											saving = false;
											saveError = `Save failed (${res.status})`;
											return;
										}
										editing = false;
										saving = false;
										await invalidateAll();
									} catch (err) {
										saving = false;
										saveError = String(err);
									}
								}}
								class="space-y-4"
							>
								<input type="hidden" name="subcategory" value={editSubcategory} />
								<div class="grid gap-4 sm:grid-cols-3">
									<div class="space-y-2">
										<Label for="style">Style Number *</Label>
										<Input id="style" name="style_number" bind:value={editStyle} required />
									</div>
									<div class="space-y-2 sm:col-span-2">
										<Label for="name">Name *</Label>
										<Input id="name" name="name" bind:value={editName} required />
									</div>
								</div>
								<div class="grid gap-4 sm:grid-cols-3">
									<div class="space-y-2">
										<Label for="wholesale">Wholesale</Label>
										<Input
											id="wholesale"
											name="wholesale_price"
											type="number"
											step="0.01"
											bind:value={editWholesale}
										/>
									</div>
									<div class="space-y-2">
										<Label for="retail">Retail</Label>
										<Input
											id="retail"
											name="retail_price"
											type="number"
											step="0.01"
											bind:value={editRetail}
										/>
									</div>
									<div class="space-y-2">
										<Label for="category">Category</Label>
										<Input id="category" name="category" bind:value={editCategory} />
									</div>
									<div class="space-y-2 sm:col-span-2">
										<Label for="season">Season</Label>
										<select
											id="season"
											name="season_id"
											bind:value={editSeasonId}
											class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
										>
											<option value="">None</option>
											{#each seasons as season (season.id)}
												<option value={season.id}>{season.name}</option>
											{/each}
										</select>
									</div>
									<div class="space-y-2">
										<Label for="productYear">Year</Label>
										<Input
											id="productYear"
											name="product_year"
											type="number"
											min="2000"
											max="2100"
											bind:value={editProductYear}
										/>
									</div>
									<div class="space-y-2 sm:col-span-2">
										<label class="flex items-start gap-3">
											<input type="hidden" name="ats" value={String(editAts)} />
											<input
												type="checkbox"
												bind:checked={editAts}
												class="mt-0.5 h-4 w-4 rounded border-input"
											/>
											<span class="space-y-1">
												<span class="block text-sm leading-none font-medium"
													>Available to Ship (ATS)</span
												>
												<span class="block text-sm text-muted-foreground"
													>In stock and shippable now. Leave off for futures / pre-orders.</span
												>
											</span>
										</label>
									</div>
								</div>
								<div class="space-y-2">
									<Label for="desc">Description</Label>
									<textarea
										id="desc"
										name="description"
										bind:value={editDescription}
										rows="3"
										class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
									></textarea>
								</div>
								<div class="flex justify-between pt-4">
									<button
										type="button"
										class="inline-flex h-9 items-center justify-center gap-2 border border-black/80 bg-background px-4 py-2 text-[13px] font-medium hover:bg-ghost dark:border-white/20"
										onclick={() => (editing = false)}>Cancel</button
									>
									<button
										type="submit"
										class="inline-flex h-9 items-center justify-center gap-2 bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
										disabled={saving}>{saving ? 'Saving…' : 'Save'}</button
									>
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
								{#if product.description}
									<div>
										<dt class="text-muted-foreground">Description</dt>
										<dd class="mt-1 whitespace-pre-wrap">{product.description}</dd>
									</div>
								{/if}
							</dl>
						{/if}
					</CardContent>
				</Card>
			{/if}

			<!-- Variants -->
			<Card>
				<CardHeader>
					<div class="flex items-center justify-between">
						<CardTitle class="text-base"
							>Variants ({product.product_variants?.length ?? 0})</CardTitle
						>
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
									{#each sizeMode === 'letter' ? commonSizes : numberedSizes as size (size)}
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
							{#each product.product_variants ?? [] as variant (variant.id)}
								<div class="flex items-center justify-between rounded-lg border px-4 py-2.5">
									<div class="flex items-center gap-4 text-sm">
										{#if variant.color}
											<span class="font-medium">{variant.color}</span>
										{/if}
										{#if variant.size}
											<span class="rounded border px-2 py-0.5 text-xs font-medium"
												>{variant.size}</span
											>
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
									<div class="flex items-center gap-3">
										{#if product.ats}
											{@const stockStatus = deriveStockStatus(
												variant.stock_qty,
												variant.stock_threshold
											)}
											{#if stockStatus !== null}
												<StockPill status={stockStatus} qty={variant.stock_qty} />
											{/if}
											{#if canEditStock}
												<VariantStockEditor
													variantId={variant.id}
													stockQty={variant.stock_qty}
													isShopifyManaged={variant.shopify_variant_id !== null}
												/>
											{/if}
										{/if}
										{#if canEdit}
											<button
												class="text-xs text-muted-foreground transition-colors hover:text-destructive"
												onclick={() => removeVariant(variant.id)}>Remove</button
											>
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
