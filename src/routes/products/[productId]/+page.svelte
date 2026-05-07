<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteMap } from 'svelte/reactivity';
	import { DropdownMenu, Dialog } from 'bits-ui';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as DialogUI from '$lib/components/ui/dialog/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import SelectField from '$lib/components/ui/select/select-field.svelte';
	import VariantMatrix from '$lib/components/products/VariantMatrix.svelte';
	import AddVariantModal from '$lib/components/products/AddVariantModal.svelte';
	import AttributePicker from '$lib/components/products/AttributePicker.svelte';
	import { getAttributeLabel } from '$lib/data/product-attributes';
	import type { Product, ProductVariant, ProductImage } from '$lib/types/database.js';

	let { data } = $props();
	const product = $derived(
		data.product as Product & {
			product_variants: ProductVariant[];
			product_images: ProductImage[];
			seasons: { name?: string } | { name?: string }[] | null;
		}
	);
	const seasons = $derived(data.seasons as { id: string; name: string }[]);

	const variantImageGroups = $derived(() => {
		const groups = new SvelteMap<
			string,
			{
				primary: ProductImage | null;
				hover: ProductImage | null;
				video: ProductImage | null;
			}
		>();
		for (const img of product.product_images ?? []) {
			const key = img.variant_id ?? '__product__';
			if (!groups.has(key)) groups.set(key, { primary: null, hover: null, video: null });
			const group = groups.get(key)!;
			if (img.role === 'primary') group.primary = img;
			else if (img.role === 'hover') group.hover = img;
			else if (img.role === 'video') group.video = img;
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
	let playingVideo = $state(false);
	let videoEl = $state<HTMLVideoElement | null>(null);

	const activeGroup = $derived(
		variantImageGroups()[activeGroupIndex] ?? variantImageGroups()[0] ?? null
	);
	const activeImage = $derived(
		selectedSubImage ?? activeGroup?.primary ?? product.product_images?.[0] ?? null
	);

	$effect(() => {
		void activeGroupIndex;
		selectedSubImage = null;
		playingVideo = false;
	});

	const variantThumbnails = $derived(variantImageGroups().map((g) => g.primary!));

	const variantSwatchMap = $derived(() => {
		const map = new Map<string, { color: string | null; hex: string | null }>();
		for (const v of product.product_variants ?? []) {
			map.set(v.id, { color: v.color, hex: v.color_hex });
		}
		return map;
	});

	const canEdit = $derived(data.membership?.role !== 'guest');
	const canDelete = $derived(['admin', 'owner'].includes(data.membership?.role ?? ''));

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const existingSizes = $derived(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient computation inside $derived
		const sizeSet = new Set<string>();
		for (const v of product.product_variants ?? []) {
			if (v.size) sizeSet.add(v.size);
		}
		const letterOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
		return [...sizeSet].sort((a, b) => {
			const ai = letterOrder.indexOf(a.toUpperCase());
			const bi = letterOrder.indexOf(b.toUpperCase());
			if (ai !== -1 && bi !== -1) return ai - bi;
			if (ai !== -1) return -1;
			if (bi !== -1) return 1;
			const an = parseFloat(a);
			const bn = parseFloat(b);
			if (!isNaN(an) && !isNaN(bn)) return an - bn;
			return a.localeCompare(b);
		});
	});

	const updatedByName = $derived(data.updatedByName as string | null);
	const updatedAtFormatted = $derived(
		product.updated_at
			? new Intl.DateTimeFormat('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				}).format(new Date(product.updated_at))
			: null
	);
	const seasonItems = $derived([
		{ value: '', label: 'None' },
		...seasons.map((s) => ({ value: s.id, label: s.name }))
	]);

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
	let editFeatured = $state(false);
	let editAttributes = $state<string[]>([]);
	let saveError = $state('');
	let saving = $state(false);

	let editingDescription = $state(false);
	let addVariantOpen = $state(false);
	let deleteConfirmOpen = $state(false);
	let deleting = $state(false);

	function startEdit() {
		editStyle = product.style_number;
		editName = product.name;
		editDescription = product.description ?? '';
		editWholesale = String(product.wholesale_price);
		editRetail = product.retail_price ? String(product.retail_price) : '0';
		editCategory = product.category ?? '';
		editSubcategory = product.subcategory ?? '';
		editSeasonId = product.season_id ?? '';
		editProductYear = product.product_year ?? new Date().getFullYear();
		editAts = product.ats ?? false;
		editFeatured = product.is_featured ?? false;
		editAttributes = [...(product.attributes ?? [])];
		editing = true;
	}

	async function commitDescription(text: string) {
		editingDescription = false;
		if (text === (product.description ?? '')) return;
		await supabase
			.from('products')
			.update({ description: text || null, updated_at: new Date().toISOString() })
			.eq('id', product.id);
		invalidateAll();
	}

	function cancelEdit() {
		editing = false;
		saveError = '';
	}

	async function saveEdit() {
		saving = true;
		saveError = '';
		const fd = new FormData();
		fd.set('style_number', editStyle);
		fd.set('name', editName);
		fd.set('description', editDescription);
		fd.set('wholesale_price', editWholesale);
		fd.set('retail_price', editRetail);
		fd.set('category', editCategory);
		fd.set('subcategory', editSubcategory);
		fd.set('season_id', editSeasonId);
		fd.set('product_year', String(editProductYear));
		fd.set('ats', String(editAts));
		fd.set('is_featured', String(editFeatured));
		fd.set('attributes', JSON.stringify(editAttributes));
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

	async function deleteProduct() {
		deleting = true;
		try {
			const fd = new FormData();
			const res = await fetch('?/delete', { method: 'POST', body: fd });
			if (res.ok) {
				await goto(resolve('/products'));
			} else {
				deleting = false;
				deleteConfirmOpen = false;
			}
		} catch {
			deleting = false;
			deleteConfirmOpen = false;
		}
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
	let videoUploadInput: HTMLInputElement | undefined = $state();
	let addHoverInput: HTMLInputElement | undefined = $state();

	async function handleAddHover() {
		const files = addHoverInput?.files;
		if (!files || files.length === 0 || !activeGroup?.primary) return;
		const formData = new FormData();
		formData.append('file', files[0]);
		if (activeGroup.primary.variant_id)
			formData.append('variant_id', activeGroup.primary.variant_id);
		formData.append('role', 'hover');
		await fetch(`/api/products/${product.id}/images`, { method: 'POST', body: formData });
		if (addHoverInput) addHoverInput.value = '';
		invalidateAll();
	}

	async function handleVideoUpload() {
		const files = videoUploadInput?.files;
		if (!files || files.length === 0 || !activeGroup) return;
		const variantId = activeGroup.primary?.variant_id ?? null;
		const formData = new FormData();
		formData.append('file', files[0]);
		if (variantId) formData.append('variant_id', variantId);
		formData.append('role', 'video');
		if (activeGroup.video) {
			await fetch(`/api/products/${product.id}/images`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ imageId: activeGroup.video.id })
			});
		}
		await fetch(`/api/products/${product.id}/images`, { method: 'POST', body: formData });
		if (videoUploadInput) videoUploadInput.value = '';
		invalidateAll();
	}

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
			<div class="flex items-center gap-2">
				<Button size="sm" onclick={startEdit}>Edit</Button>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-sm transition-colors hover:bg-muted"
						aria-label="More actions"
					>
						&middot;&middot;&middot;
					</DropdownMenu.Trigger>
					<DropdownMenu.Portal>
						<DropdownMenu.Content
							align="end"
							sideOffset={4}
							class="z-50 min-w-[140px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
						>
							<DropdownMenu.Item
								class="flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm transition-colors select-none data-[highlighted]:bg-muted"
								onSelect={toggleArchive}
							>
								{product.archived_at ? 'Unarchive' : 'Archive'}
							</DropdownMenu.Item>
							{#if canDelete}
								<DropdownMenu.Item
									class="flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm text-destructive transition-colors select-none data-[highlighted]:bg-destructive/10"
									onSelect={() => (deleteConfirmOpen = true)}
								>
									Delete
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
			</div>
		{/if}
	</div>

	{#snippet metaBanner()}
		<div class="flex items-center justify-between gap-4">
			<div>
				{#if editing}
					<div class="mb-1 flex items-center gap-2">
						<span
							contenteditable="true"
							role="textbox"
							aria-label="Style number"
							class="min-w-[60px] border-b-2 border-dotted border-muted-foreground/40 pb-0.5 font-mono text-sm text-muted-foreground outline-none"
							bind:textContent={editStyle}
						></span>
						<Badge variant={product.archived_at ? 'destructive' : 'success'}>
							{product.archived_at ? 'Archived' : 'Active'}
						</Badge>
					</div>
					<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
					<h2
						contenteditable="true"
						role="textbox"
						aria-label="Product name"
						class="min-w-[120px] border-b-2 border-dotted border-muted-foreground/40 pb-0.5 text-xl font-semibold outline-none"
						bind:textContent={editName}
					></h2>
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<SelectField
							bind:value={editSeasonId}
							items={seasonItems}
							placeholder="Season"
							class="w-40"
						/>
						<input
							type="number"
							min="2000"
							max="2100"
							bind:value={editProductYear}
							class="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring"
							aria-label="Year"
						/>
					</div>
				{:else}
					<div class="mb-1 flex items-center gap-2">
						<span class="font-mono text-sm text-muted-foreground">{product.style_number}</span>
						<Badge variant={product.archived_at ? 'destructive' : 'success'}>
							{product.archived_at ? 'Archived' : 'Active'}
						</Badge>
					</div>
					<h2 class="text-xl font-semibold">{product.name}</h2>
					{#if product.season_id || product.product_year}
						{@const seasonJoin = product.seasons as { name?: string } | { name?: string }[] | null}
						{@const seasonName = Array.isArray(seasonJoin) ? seasonJoin[0]?.name : seasonJoin?.name}
						{@const seasonYear = [seasonName, product.product_year].filter(Boolean).join(' ')}
						{#if seasonYear}
							<p class="mt-1 text-sm text-muted-foreground">{seasonYear}</p>
						{/if}
					{/if}
				{/if}
			</div>
			<div class="shrink-0 text-right">
				<p class="text-sm text-muted-foreground">Wholesale</p>
				{#if editing}
					<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
					<p
						contenteditable="true"
						role="textbox"
						aria-label="Wholesale price"
						class="border-b-2 border-dotted border-muted-foreground/40 pb-0.5 text-right text-xl font-semibold outline-none"
						oninput={(e) => {
							const raw = (e.currentTarget as HTMLElement).textContent ?? '';
							editWholesale = raw.replace(/[^0-9.]/g, '');
						}}
					>
						{editWholesale}
					</p>
					<p class="mt-1 text-sm text-muted-foreground">Retail</p>
					<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
					<p
						contenteditable="true"
						role="textbox"
						aria-label="Retail price"
						class="border-b-2 border-dotted border-muted-foreground/40 pb-0.5 text-right text-sm outline-none"
						oninput={(e) => {
							const raw = (e.currentTarget as HTMLElement).textContent ?? '';
							editRetail = raw.replace(/[^0-9.]/g, '');
						}}
					>
						{editRetail}
					</p>
				{:else}
					<p class="text-xl font-semibold">{fmt.format(Number(product.wholesale_price))}</p>
					{#if product.retail_price}
						<p class="text-sm text-muted-foreground">
							Retail — {fmt.format(Number(product.retail_price))}
						</p>
					{/if}
				{/if}
			</div>
		</div>
	{/snippet}

	<!-- Mobile: meta banner above image -->
	<div class="mb-6 lg:hidden">
		{@render metaBanner()}
	</div>

	<div class="grid gap-6 min-[960px]:grid-cols-[1fr_1fr] lg:grid-cols-[480px_1fr]">
		<!-- Left: primary image + variant thumbnails -->
		<div class="lg:sticky lg:top-6 lg:self-start">
			<div class="group/main relative aspect-[4/5] w-full overflow-hidden bg-muted">
				{#if playingVideo && activeGroup?.video}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						bind:this={videoEl}
						src={`/api/products/${product.id}/images/${activeGroup.video.id}`}
						class="absolute inset-0 h-full w-full cursor-pointer object-cover"
						autoplay
						loop
						muted
						playsinline
						onclick={() => {
							if (videoEl) {
								videoEl.paused ? videoEl.play() : videoEl.pause();
							}
						}}
					></video>
				{:else if activeImage}
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
							{#if activeGroup?.primary && !activeGroup?.hover}
								<button
									class="rounded bg-white/90 px-2.5 py-1 text-sm font-medium text-foreground"
									onclick={() => addHoverInput?.click()}>+ Hover</button
								>
							{/if}
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
			<input
				bind:this={addHoverInput}
				type="file"
				accept="image/jpeg,image/png,image/webp,image/avif"
				class="hidden"
				onchange={handleAddHover}
			/>
			<input
				bind:this={videoUploadInput}
				type="file"
				accept="video/mp4,video/quicktime"
				class="hidden"
				onchange={handleVideoUpload}
			/>
			{#if activeGroup && activeGroup.primary && activeGroup.hover}
				<div class="mt-2 grid grid-cols-2 gap-2">
					{#if activeGroup.primary}
						<div
							role="button"
							tabindex="-1"
							class="group/img relative aspect-square overflow-hidden bg-muted"
							onmouseenter={() => {
								playingVideo = false;
								selectedSubImage = activeGroup.primary;
							}}
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
								</div>
							{/if}
						</div>
					{/if}
					{#if activeGroup.hover}
						<div
							role="button"
							tabindex="-1"
							class="group/img relative aspect-square overflow-hidden bg-muted"
							onmouseenter={() => {
								if (activeGroup.video) {
									playingVideo = true;
									selectedSubImage = null;
								} else {
									selectedSubImage = activeGroup.hover;
								}
							}}
						>
							<img
								src="/api/products/{product.id}/images/{activeGroup.hover.id}"
								alt="{product.name} — hover"
								class="h-full w-full object-cover"
							/>
							{#if activeGroup.video}
								<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
									<div class="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="currentColor"
											class="h-5 w-5 text-white"
										>
											<path
												d="M6 20.1957V3.80421C6 3.01878 6.86395 2.53993 7.53 2.95621L20.6432 11.152C21.2699 11.5436 21.2699 12.4563 20.6432 12.848L7.53 21.0437C6.86395 21.46 6 20.9812 6 20.1957Z"
											></path>
										</svg>
									</div>
								</div>
							{/if}
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
									<button
										class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-foreground transition-colors hover:bg-white dark:bg-black/90 dark:hover:bg-black"
										onclick={() => videoUploadInput?.click()}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="currentColor"
											class="h-4 w-4"
											><path
												d="M17 9.2L22.2133 5.55071C22.4395 5.39235 22.7513 5.44737 22.9096 5.6736C22.9684 5.75764 23 5.85774 23 5.96033V18.0397C23 18.3158 22.7761 18.5397 22.5 18.5397C22.3974 18.5397 22.2973 18.5081 22.2133 18.4493L17 14.8V19C17 19.5523 16.5523 20 16 20H2C1.44772 20 1 19.5523 1 19V5C1 4.44772 1.44772 4 2 4H16C16.5523 4 17 4.44772 17 5V9.2Z"
											></path></svg
										>
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right: details column -->
		<div class="min-w-0 space-y-6">
			<!-- Desktop: meta banner stays in right column -->
			<div class="hidden lg:block">
				{@render metaBanner()}
			</div>

			<!-- Variant thumbnails + add button -->
			<div class="flex flex-wrap gap-1.5">
				{#each variantThumbnails as thumb, i (thumb.id)}
					<div class="group/thumb relative">
						<button
							type="button"
							class="relative h-14 w-14 shrink-0 overflow-hidden transition-all"
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
						{#if canEdit && thumb.variant_id && variantThumbnails.length > 1}
							<button
								type="button"
								class="absolute -top-2.5 -right-2 z-10 cursor-pointer rounded-full bg-white text-red-500 opacity-0 transition-opacity group-hover/thumb:opacity-100 dark:bg-black"
								onclick={async () => {
									const color = (product.product_variants ?? []).find(
										(v) => v.id === thumb.variant_id
									)?.color;
									const ids = (product.product_variants ?? [])
										.filter((v) => v.color === color)
										.map((v) => v.id);
									if (ids.length === 0) return;
									await supabase.from('product_variants').delete().in('id', ids);
									invalidateAll();
								}}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="currentColor"
									class="h-5 w-5"
									><path
										d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM7 11V13H17V11H7Z"
									></path></svg
								>
							</button>
						{/if}
					</div>
				{/each}
				{#if canEdit}
					<button
						type="button"
						class="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-dashed border-muted-foreground/30 text-lg text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
						onclick={() => (addVariantOpen = true)}
					>
						+
					</button>
				{/if}
			</div>

			<!-- Description -->
			{#if editing}
				<div>
					<p class="mb-1.5 text-sm text-muted-foreground">Description</p>
					<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
					<p
						contenteditable="true"
						role="textbox"
						aria-label="Description"
						aria-multiline="true"
						class="min-h-[3em] w-full border-b-2 border-dotted border-muted-foreground/40 pb-0.5 text-sm whitespace-pre-wrap outline-none"
						bind:textContent={editDescription}
					></p>
				</div>
			{:else}
				<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
				<p
					class="cursor-text text-sm whitespace-pre-wrap outline-none"
					contenteditable={editingDescription ? 'true' : 'false'}
					role={editingDescription ? 'textbox' : undefined}
					ondblclick={() => {
						if (canEdit) editingDescription = true;
					}}
					onblur={(e) => {
						if (editingDescription) {
							commitDescription((e.target as HTMLElement).textContent?.trim() ?? '');
						}
					}}
					onkeydown={(e) => {
						if (editingDescription && e.key === 'Escape') {
							editingDescription = false;
							(e.target as HTMLElement).textContent = product.description ?? '';
							(e.target as HTMLElement).blur();
						}
					}}
				>
					{product.description || 'Double-click to add a description'}
				</p>
			{/if}

			<!-- Attributes -->
			{#if editing}
				<div>
					<p class="mb-1.5 text-sm text-muted-foreground">Attributes</p>
					<AttributePicker selected={editAttributes} onchange={(v) => (editAttributes = v)} />
				</div>
			{:else if product.attributes && product.attributes.length > 0}
				<div>
					<p class="mb-1.5 text-sm text-muted-foreground">Attributes</p>
					<div class="flex flex-wrap gap-1.5">
						{#each product.attributes as attr (attr)}
							<span class="border border-border px-2.5 py-1 text-sm">{getAttributeLabel(attr)}</span
							>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Save error -->
			{#if saveError}
				<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{saveError}
				</div>
			{/if}

			<!-- Variant matrix -->
			<VariantMatrix
				variants={product.product_variants ?? []}
				ats={product.ats}
				onRenameColor={async (oldColor, newColor) => {
					const ids = (product.product_variants ?? [])
						.filter((v) => v.color === oldColor)
						.map((v) => v.id);
					if (ids.length === 0) return;
					await supabase.from('product_variants').update({ color: newColor }).in('id', ids);
					invalidateAll();
				}}
				onChangeColorHex={async (color, newHex) => {
					const ids = (product.product_variants ?? [])
						.filter((v) => v.color === color)
						.map((v) => v.id);
					if (ids.length === 0) return;
					await supabase.from('product_variants').update({ color_hex: newHex }).in('id', ids);
					invalidateAll();
				}}
			/>

			<!-- Categories -->
			{#if editing}
				<div class="flex gap-3">
					<div class="flex-1">
						<p class="mb-1 text-sm text-muted-foreground">Category</p>
						<input
							type="text"
							bind:value={editCategory}
							placeholder="e.g. Tops"
							class="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring"
						/>
					</div>
					<div class="flex-1">
						<p class="mb-1 text-sm text-muted-foreground">Subcategory</p>
						<input
							type="text"
							bind:value={editSubcategory}
							placeholder="e.g. Blouses"
							class="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring"
						/>
					</div>
				</div>
			{:else if product.category}
				<p class="text-sm text-muted-foreground">
					{product.category}{product.subcategory ? ` / ${product.subcategory}` : ''}
				</p>
			{/if}

			<!-- Bottom metadata row -->
			{#if editing}
				<div class="flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4">
					<label class="flex items-center gap-2">
						<Switch bind:checked={editAts} aria-label="Available to Ship" />
						<span class="text-sm">ATS</span>
					</label>
					<label class="flex items-center gap-2">
						<Switch bind:checked={editFeatured} aria-label="Featured" />
						<span class="text-sm">Featured</span>
					</label>
				</div>
			{:else}
				<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-4">
					{#if updatedByName || updatedAtFormatted}
						<p class="text-sm text-muted-foreground">
							Updated{updatedByName ? ` by ${updatedByName}` : ''}{updatedAtFormatted
								? ` · ${updatedAtFormatted}`
								: ''}
						</p>
					{/if}
					{#if product.ats}
						<Badge variant="secondary">ATS</Badge>
					{/if}
					{#if product.is_featured}
						<Badge variant="secondary">Featured</Badge>
					{/if}
				</div>
			{/if}

			<!-- Save/Cancel bar (edit mode only) -->
			{#if editing}
				<div class="flex justify-end gap-2 border-t pt-4">
					<Button variant="outline" onclick={cancelEdit}>Cancel</Button>
					<Button onclick={saveEdit} disabled={saving}>
						{saving ? 'Saving…' : 'Save'}
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>

<AddVariantModal
	bind:open={addVariantOpen}
	productId={product.id}
	existingSizes={existingSizes()}
/>

<Dialog.Root bind:open={deleteConfirmOpen}>
	<DialogUI.DialogContent class="max-w-sm p-6">
		<DialogUI.DialogTitle class="text-lg font-semibold">Delete Product</DialogUI.DialogTitle>
		<DialogUI.DialogDescription class="mt-2 text-sm text-muted-foreground">
			This will permanently delete <span class="font-medium text-foreground">{product.name}</span> and
			all its variants. This action cannot be undone.
		</DialogUI.DialogDescription>
		<div class="mt-6 flex justify-end gap-2">
			<Button variant="outline" onclick={() => (deleteConfirmOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={deleteProduct} disabled={deleting}>
				{deleting ? 'Deleting…' : 'Delete'}
			</Button>
		</div>
	</DialogUI.DialogContent>
</Dialog.Root>
