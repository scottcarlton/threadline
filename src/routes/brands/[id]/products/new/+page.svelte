<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { Label } from '$lib/components/ui/label/index.js';

	let { data } = $props();
	const brand = $derived(data.brand as { id: string; name: string });
	const seasons = $derived(data.seasons as { id: string; name: string }[]);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// Steps
	let step = $state(1);
	const steps = ['General Info', 'Description', 'Sizes & Colors', 'Pricing', 'Images'];

	// Form state
	let productName = $state('');
	let styleNumber = $state('');
	let category = $state('');
	let seasonId = $state('');
	let productYear = $state<number>(new Date().getFullYear());
	let description = $state('');
	let wholesalePrice = $state('');
	let retailPrice = $state('');

	// Sizes
	const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
	const numberedSizes = ['0', '2', '4', '6', '8', '10', '12', '14'];
	let selectedSizes = $state<Set<string>>(new Set());
	let customSize = $state('');
	let sizeMode = $state<'letter' | 'number'>('letter');

	function toggleSize(size: string) {
		const next = new Set(selectedSizes);
		if (next.has(size)) next.delete(size);
		else next.add(size);
		selectedSizes = next;
	}

	function addCustomSize() {
		if (customSize.trim() && !selectedSizes.has(customSize.trim())) {
			selectedSizes = new Set([...selectedSizes, customSize.trim()]);
			customSize = '';
		}
	}

	// Colors
	let colors = $state<{ name: string; hex: string }[]>([]);
	let newColorName = $state('');
	let newColorHex = $state('#000000');

	function addColor() {
		if (newColorName.trim()) {
			colors = [...colors, { name: newColorName.trim(), hex: newColorHex }];
			newColorName = '';
			newColorHex = '#000000';
		}
	}

	function removeColor(index: number) {
		colors = colors.filter((_, i) => i !== index);
	}

	// Images (upload after product creation)
	let imageFiles = $state<File[]>([]);
	let imagePreviews = $state<string[]>([]);
	let primaryImageIndex = $state(0);
	let fileInput: HTMLInputElement | undefined = $state();

	function handleFiles(files: FileList | null) {
		if (!files) return;
		for (const file of files) {
			if (file.type.startsWith('image/')) {
				imageFiles = [...imageFiles, file];
				const url = URL.createObjectURL(file);
				imagePreviews = [...imagePreviews, url];
			}
		}
	}

	function removeImage(index: number) {
		imageFiles = imageFiles.filter((_, i) => i !== index);
		imagePreviews = imagePreviews.filter((_, i) => i !== index);
		if (primaryImageIndex >= imagePreviews.length) primaryImageIndex = 0;
	}

	// Save
	let saving = $state(false);
	let saveError = $state('');

	async function handleSave() {
		if (!productName.trim() || !styleNumber.trim()) return;
		saving = true;
		saveError = '';

		// 1. Create product
		const { data: product, error: prodErr } = await supabase
			.from('products')
			.insert({
				organization_id: data.organization?.id,
				brand_id: brand.id,
				style_number: styleNumber.trim(),
				name: productName.trim(),
				description: description.trim() || null,
				wholesale_price: parseFloat(wholesalePrice) || 0,
				retail_price: parseFloat(retailPrice) || null,
				category: category.trim() || null,
				season_id: seasonId || null,
				product_year: productYear || null
			})
			.select()
			.single();

		if (prodErr || !product) {
			saveError = prodErr?.message ?? 'Failed to create product';
			saving = false;
			return;
		}

		// 2. Create variants (size × color matrix)
		const sizesArr = Array.from(selectedSizes);
		const variants: { product_id: string; color: string | null; size: string | null }[] = [];

		if (sizesArr.length > 0 && colors.length > 0) {
			for (const color of colors) {
				for (const size of sizesArr) {
					variants.push({ product_id: product.id, color: color.name, size });
				}
			}
		} else if (sizesArr.length > 0) {
			for (const size of sizesArr) {
				variants.push({ product_id: product.id, color: null, size });
			}
		} else if (colors.length > 0) {
			for (const color of colors) {
				variants.push({ product_id: product.id, color: color.name, size: null });
			}
		}

		if (variants.length > 0) {
			await supabase.from('product_variants').insert(variants);
		}

		// 3. Upload images
		for (let i = 0; i < imageFiles.length; i++) {
			const formData = new FormData();
			formData.append('file', imageFiles[i]);
			await fetch(`/api/products/${product.id}/images`, { method: 'POST', body: formData });
			// Set primary
			if (i === primaryImageIndex) {
				const { data: images } = await supabase
					.from('product_images')
					.select('id')
					.eq('product_id', product.id)
					.order('created_at', { ascending: false })
					.limit(1);
				if (images?.[0]) {
					await supabase.from('product_images').update({ is_primary: true }).eq('id', images[0].id);
				}
			}
		}

		saving = false;
		goto(`/brands/${brand.id}/products/${product.id}`);
	}

	// Derived preview
	const previewSizes = $derived(Array.from(selectedSizes));
	const previewPrice = $derived(parseFloat(wholesalePrice) || 0);
</script>

<div class="mx-auto max-w-5xl space-y-6">
	<!-- Header -->
	<div class="flex items-center gap-3">
		<Button
			variant="ghost"
			size="sm"
			href={data.orgType === 'brand' ? '/products' : `/brands/${brand.id}/products`}
		>
			<LongArrow direction="left" /> Products
		</Button>
		<h1 class="text-3xl">New Product</h1>
	</div>

	<!-- Step indicator -->
	<div class="flex items-center gap-2">
		{#each steps as s, i}
			<button
				class="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors {i +
					1 ===
				step
					? 'bg-primary text-primary-foreground'
					: i + 1 < step
						? 'bg-emerald-100 text-emerald-700'
						: 'bg-muted text-muted-foreground'}"
				onclick={() => (step = i + 1)}
			>
				{#if i + 1 < step}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3.5 w-3.5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						/>
					</svg>
				{/if}
				{s}
			</button>
			{#if i < steps.length - 1}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 text-muted-foreground/40"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
			{/if}
		{/each}
	</div>

	<!-- Two-column layout -->
	<div class="grid gap-8 lg:grid-cols-[1fr_380px]">
		<!-- Left: Form -->
		<div class="space-y-6">
			<!-- Step 5: Images -->
			{#if step === 5}
				<div class="space-y-4">
					<div>
						<h2 class="text-lg font-semibold">Product Images</h2>
						<p class="text-sm text-muted-foreground">Upload photos of your product</p>
					</div>

					<!-- Drop zone -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-none border-2 border-dashed border-muted-foreground/20 bg-muted/20 p-8 transition-colors hover:border-primary/40 hover:bg-muted/40"
						onclick={() => fileInput?.click()}
						ondragover={(e) => e.preventDefault()}
						ondrop={(e) => {
							e.preventDefault();
							handleFiles(e.dataTransfer?.files ?? null);
						}}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-10 w-10 text-muted-foreground/40"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
							/>
						</svg>
						<p class="mt-2 text-sm font-medium">Drag & drop images here</p>
						<p class="text-sm text-muted-foreground">or click to browse</p>
						<input
							type="file"
							accept="image/*"
							multiple
							bind:this={fileInput}
							onchange={(e) => handleFiles((e.target as HTMLInputElement).files)}
							class="hidden"
						/>
					</div>

					<!-- Thumbnails -->
					{#if imagePreviews.length > 0}
						<div class="grid grid-cols-4 gap-3">
							{#each imagePreviews as preview, i}
								<div
									class="group relative aspect-square overflow-hidden rounded-lg border {i ===
									primaryImageIndex
										? 'ring-2 ring-primary'
										: ''}"
								>
									<img src={preview} alt="Product" class="h-full w-full object-cover" />
									<div
										class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100"
									>
										{#if i !== primaryImageIndex}
											<button
												class="rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-900"
												onclick={() => (primaryImageIndex = i)}>Set Primary</button
											>
										{/if}
										<button
											class="rounded bg-red-500/90 px-2 py-1 text-[11px] font-medium text-white"
											onclick={() => removeImage(i)}>Remove</button
										>
									</div>
									{#if i === primaryImageIndex}
										<span
											class="absolute top-1.5 left-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
											>Primary</span
										>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Step 1: General Info -->
			{#if step === 1}
				<div class="space-y-6">
					<div>
						<h2 class="text-lg font-semibold">General Information</h2>
						<p class="text-sm text-muted-foreground">Basic product details</p>
					</div>

					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="name">Product Name</Label>
							<Input
								id="name"
								bind:value={productName}
								placeholder="e.g. Linen Button-Down Shirt"
							/>
						</div>
						<div class="space-y-2">
							<Label for="style">Style Number</Label>
							<Input id="style" bind:value={styleNumber} placeholder="e.g. VR-2001" />
						</div>
					</div>

					<div class="space-y-4 border-t border-dashed pt-6">
						<div>
							<p class="text-sm font-semibold">Category & Season</p>
							<p class="text-sm text-muted-foreground">Helps organize your catalog</p>
						</div>
						<div class="space-y-2">
							<Label for="category">Category</Label>
							<Input
								id="category"
								bind:value={category}
								placeholder="e.g. Tops, Bottoms, Dresses, Outerwear"
							/>
						</div>
						<div class="grid grid-cols-[1fr_120px] gap-3">
							<div class="space-y-2">
								<Label for="season">Season</Label>
								<select
									id="season"
									bind:value={seasonId}
									class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
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
									bind:value={productYear}
								/>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Step 2: Description -->
			{#if step === 2}
				<div class="space-y-6">
					<div>
						<h2 class="text-lg font-semibold">Description</h2>
						<p class="text-sm text-muted-foreground">Describe your product for buyers</p>
					</div>
					<div class="space-y-2">
						<Label for="description">Product Description</Label>
						<textarea
							id="description"
							bind:value={description}
							rows="6"
							placeholder="Materials, fit, styling details, care instructions..."
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
						></textarea>
					</div>
				</div>
			{/if}

			<!-- Step 3: Sizes & Colors -->
			{#if step === 3}
				<div class="space-y-6">
					<div>
						<h2 class="text-lg font-semibold">Sizes</h2>
						<p class="text-sm text-muted-foreground">Pick available sizes</p>
					</div>

					<!-- Size mode toggle -->
					<div class="flex w-fit gap-1 rounded-lg bg-muted p-1">
						<button
							class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {sizeMode ===
							'letter'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground'}"
							onclick={() => (sizeMode = 'letter')}>Letter</button
						>
						<button
							class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {sizeMode ===
							'number'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground'}"
							onclick={() => (sizeMode = 'number')}>Numeric</button
						>
					</div>

					<!-- Size pills -->
					<div class="flex flex-wrap gap-2">
						{#each sizeMode === 'letter' ? commonSizes : numberedSizes as size}
							<button
								class="flex h-10 w-12 items-center justify-center rounded-lg border-2 text-sm font-medium transition-all {selectedSizes.has(
									size
								)
									? 'border-primary bg-primary/10 text-primary'
									: 'border-muted text-muted-foreground hover:border-foreground/20'}"
								onclick={() => toggleSize(size)}
							>
								{size}
							</button>
						{/each}
						<!-- Custom size -->
						<div class="flex items-center gap-1">
							<input
								type="text"
								bind:value={customSize}
								placeholder="Custom"
								class="h-10 w-20 rounded-lg border-2 border-dashed border-muted bg-background px-2 text-center text-sm focus:border-primary focus:outline-none"
								onkeydown={(e) => {
									if (e.key === 'Enter') addCustomSize();
								}}
							/>
							{#if customSize.trim()}
								<button class="text-xs text-primary" onclick={addCustomSize}>Add</button>
							{/if}
						</div>
					</div>

					<!-- Color variants -->
					<div class="space-y-4 border-t border-dashed pt-6">
						<div>
							<h2 class="text-lg font-semibold">Colors & Prints</h2>
							<p class="text-sm text-muted-foreground">
								Add solid colors, prints, or patterns (e.g. Navy, Leopard, Floral Stripe)
							</p>
						</div>

						{#if colors.length > 0}
							<div class="space-y-2">
								{#each colors as color, i}
									<div class="flex items-center gap-3 rounded-lg border px-4 py-2.5">
										<div
											class="h-6 w-6 rounded-full border"
											style="background-color: {color.hex}"
										></div>
										<span class="flex-1 text-sm font-medium">{color.name}</span>
										<button
											class="text-xs text-muted-foreground transition-colors hover:text-destructive"
											onclick={() => removeColor(i)}>Remove</button
										>
									</div>
								{/each}
							</div>
						{/if}

						<div class="flex items-center gap-3">
							<input
								type="color"
								bind:value={newColorHex}
								class="h-9 w-9 shrink-0 cursor-pointer rounded border-0 p-0"
								title="Pick a swatch color (optional)"
							/>
							<Input
								bind:value={newColorName}
								placeholder="e.g. Navy, Leopard Print, Floral"
								class="flex-1"
							/>
							<Button variant="outline" size="sm" onclick={addColor} disabled={!newColorName.trim()}
								>Add</Button
							>
						</div>

						{#if selectedSizes.size > 0 && colors.length > 0}
							<p class="text-sm text-muted-foreground">
								This will create <span class="font-medium text-foreground"
									>{selectedSizes.size * colors.length}</span
								>
								variants ({selectedSizes.size} sizes × {colors.length} colors)
							</p>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Step 4: Pricing -->
			{#if step === 4}
				<div class="space-y-6">
					<div>
						<h2 class="text-lg font-semibold">Pricing</h2>
						<p class="text-sm text-muted-foreground">Set wholesale and retail prices</p>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="wholesale">Wholesale Price *</Label>
							<div class="relative">
								<span class="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
									>$</span
								>
								<Input
									id="wholesale"
									type="number"
									step="0.01"
									bind:value={wholesalePrice}
									placeholder="0.00"
									class="pl-7"
								/>
							</div>
						</div>
						<div class="space-y-2">
							<Label for="retail">Retail Price (MSRP)</Label>
							<div class="relative">
								<span class="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
									>$</span
								>
								<Input
									id="retail"
									type="number"
									step="0.01"
									bind:value={retailPrice}
									placeholder="0.00"
									class="pl-7"
								/>
							</div>
						</div>
					</div>

					{#if saveError}
						<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{saveError}</div>
					{/if}
				</div>
			{/if}

			<!-- Navigation -->
			<div class="flex items-center justify-between border-t pt-4">
				{#if step > 1}
					<Button variant="outline" onclick={() => (step -= 1)}>Previous</Button>
				{:else}
					<div></div>
				{/if}

				{#if step < 5}
					<Button onclick={() => (step += 1)}>Next</Button>
				{:else}
					<Button
						onclick={handleSave}
						disabled={saving || !productName.trim() || !styleNumber.trim() || !wholesalePrice}
					>
						{saving ? 'Creating...' : 'Create Product'}
					</Button>
				{/if}
			</div>
		</div>

		<!-- Right: Product Card Preview -->
		<div class="hidden lg:block">
			<div class="sticky top-6">
				<p class="mb-3 text-sm font-medium text-muted-foreground">Product Card Preview</p>
				<div class="overflow-hidden rounded-none border bg-card">
					<!-- Image -->
					<div class="aspect-[4/3] bg-muted">
						{#if imagePreviews.length > 0}
							<img
								src={imagePreviews[primaryImageIndex] ?? imagePreviews[0]}
								alt="Preview"
								class="h-full w-full object-cover"
							/>
						{:else}
							<div class="flex h-full items-center justify-center text-muted-foreground">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-12 w-12 opacity-30"
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
					</div>

					<div class="space-y-3 p-5">
						<!-- Name -->
						<div>
							<p class="text-lg font-semibold">{productName || 'Product Name'}</p>
							{#if styleNumber}
								<p class="text-sm text-muted-foreground">{styleNumber}</p>
							{/if}
						</div>

						<!-- Color swatches -->
						{#if colors.length > 0}
							<div class="flex items-center gap-2">
								{#each colors as color}
									<div
										class="h-6 w-6 rounded-full border border-muted"
										style="background-color: {color.hex}"
										title={color.name}
									></div>
								{/each}
							</div>
						{/if}

						<!-- Sizes -->
						{#if previewSizes.length > 0}
							<div class="flex items-center gap-1.5">
								{#each previewSizes as size}
									<span class="rounded border px-2 py-0.5 text-xs font-medium">{size}</span>
								{/each}
							</div>
						{/if}

						<!-- Price -->
						<div class="flex items-center gap-3">
							<span class="text-xl font-bold"
								>{previewPrice > 0 ? fmt.format(previewPrice) : '$0.00'}</span
							>
							{#if parseFloat(retailPrice) > 0}
								<span class="text-sm text-muted-foreground"
									>MSRP {fmt.format(parseFloat(retailPrice))}</span
								>
							{/if}
						</div>

						{#if category}
							<span
								class="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
								>{category}</span
							>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
