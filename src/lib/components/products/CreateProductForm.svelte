<script lang="ts">
	import { goto, invalidate } from '$app/navigation';

	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { createProductSchema, type CreateProductInput } from '$lib/schemas/product';
	import type { SuperValidated } from 'sveltekit-superforms';
	import SizePicker from './SizePicker.svelte';
	import InventoryMatrix from './InventoryMatrix.svelte';
	import ImagePair from './ImagePair.svelte';
	import VariantRow from './VariantRow.svelte';
	import ProductCardPreview from './ProductCardPreview.svelte';

	type Props = {
		formData: SuperValidated<CreateProductInput>;
		brand: { id: string; name: string };
		seasons: { id: string; name: string }[];
		cancelHref: string;
		successHref: (productId: string) => string;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { formData, brand, seasons, cancelHref, successHref }: Props = $props();

	async function uploadImage(
		productId: string,
		file: File,
		variantId: string | null,
		role: 'primary' | 'hover'
	): Promise<boolean> {
		const body = new FormData();
		body.append('file', file);
		if (variantId) body.append('variant_id', variantId);
		body.append('role', role);
		const res = await fetch(`/api/products/${productId}/images`, {
			method: 'POST',
			body
		});
		return res.ok;
	}

	// Snapshot form state before submit — superforms resets $form after the
	// server responds, so onUpdated can't read the user's original values.
	type FormSnapshot = {
		hasVariants: boolean;
		variants: Array<{ id: string; colorName: string }>;
	};
	let preSubmitSnapshot: FormSnapshot | null = $state(null);

	async function uploadAllImages(productId: string, colorToVariantId: Record<string, string>) {
		const snap = preSubmitSnapshot;
		const failures: string[] = [];

		if (!snap || !snap.hasVariants) {
			const variantId = colorToVariantId['__none__'] ?? null;
			if (productPrimaryImage) {
				if (!(await uploadImage(productId, productPrimaryImage, variantId, 'primary'))) {
					failures.push('product primary');
				}
			}
			if (productHoverImage) {
				if (!(await uploadImage(productId, productHoverImage, variantId, 'hover'))) {
					failures.push('product hover');
				}
			}
		} else {
			for (const v of snap.variants) {
				const variantId = colorToVariantId[v.colorName] ?? null;
				const imgs = variantImages.get(v.id);
				if (imgs?.primary) {
					if (!(await uploadImage(productId, imgs.primary, variantId, 'primary'))) {
						failures.push(`${v.colorName} primary`);
					}
				}
				if (imgs?.hover) {
					if (!(await uploadImage(productId, imgs.hover, variantId, 'hover'))) {
						failures.push(`${v.colorName} hover`);
					}
				}
			}
		}

		return failures;
	}

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(formData, {
		validators: zod4Client(createProductSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		onSubmit: () => {
			preSubmitSnapshot = {
				hasVariants: $form.hasVariants,
				variants: $form.variants.map((v) => ({ id: v.id, colorName: v.colorName }))
			};
		},
		onUpdated: async ({ form: f }) => {
			const msg = f.message as
				| {
						kind: 'success';
						productId: string;
						colorToVariantId: Record<string, string>;
				  }
				| string
				| undefined;
			if (typeof msg === 'string') {
				toast.error(msg);
				return;
			}
			if (msg?.kind === 'success') {
				const failures = await uploadAllImages(msg.productId, msg.colorToVariantId);
				if (failures.length > 0) {
					toast.success('Product created');
					toast.warning(`Failed to upload: ${failures.join(', ')}`);
				} else {
					toast.success('Product created');
				}
				await invalidate('data:products');
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic path from prop
				goto(successHref(msg.productId));
			}
		},
		onError: ({ result }) => {
			toast.error(result.error?.message ?? 'Something went wrong. Please try again.');
		}
	});

	// Stepper
	let currentStep = $state(0);
	const stepsAll = ['General', 'Sizes & Variants', 'Description'];

	function nextStep() {
		if (currentStep < stepsAll.length - 1) currentStep++;
	}
	function prevStep() {
		if (currentStep > 0) currentStep--;
	}
	function handleCancel() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic path from prop
		goto(cancelHref);
	}

	// Step 1 validation — required fields
	const step1Valid = $derived(
		$form.name.trim().length > 0 && $form.styleNumber.trim().length > 0 && $form.wholesalePrice > 0
	);

	// Step 2 validation — at least one size; if hasVariants, at least one variant with a name
	const step2Valid = $derived(() => {
		if ($form.sizes.length === 0) return false;
		if ($form.hasVariants && $form.variants.length === 0) return false;
		if ($form.hasVariants && !$form.variants.some((v) => v.colorName.trim().length > 0))
			return false;
		return true;
	});

	// Image state (not part of superforms — Files can't serialize)
	let productPrimaryImage = $state<File | null>(null);
	let productHoverImage = $state<File | null>(null);

	// Variant accordion
	let expandedVariantId = $state<string | null>(null);

	function addVariant() {
		const id = crypto.randomUUID();
		$form.variants = [
			...$form.variants,
			{
				id,
				colorName: '',
				colorHex: '',
				isPrimary: $form.variants.length === 0,
				inventory: {},
				stockThreshold: null
			}
		];
		expandedVariantId = id;
	}

	function removeVariant(id: string) {
		const wasPrimary = $form.variants.find((v) => v.id === id)?.isPrimary;
		$form.variants = $form.variants.filter((v) => v.id !== id);
		if (wasPrimary && $form.variants.length > 0) {
			$form.variants[0].isPrimary = true;
			$form.variants = [...$form.variants];
		}
		if (expandedVariantId === id) {
			expandedVariantId = $form.variants[0]?.id ?? null;
		}
	}

	function setPrimaryVariant(id: string) {
		$form.variants = $form.variants.map((v) => ({ ...v, isPrimary: v.id === id }));
	}

	// Variant image state (keyed by variant id)
	let variantImages = $state(new Map<string, { primary: File | null; hover: File | null }>());

	function getVariantImages(id: string): { primary: File | null; hover: File | null } {
		let entry = variantImages.get(id);
		if (!entry) {
			entry = { primary: null, hover: null };
			variantImages.set(id, entry);
		}
		return entry;
	}

	const seasonItems = $derived([
		{ value: '', label: 'None' },
		...seasons.map((s) => ({ value: s.id, label: s.name }))
	]);
</script>

<svelte:head><title>New Product — Threadline</title></svelte:head>

<div class="w-full">
	<!-- Top nav -->
	<div class="mb-4 flex items-center justify-between">
		{#if currentStep > 0}
			<Button variant="ghost" size="sm" onclick={prevStep}>
				<LongArrow direction="left" /> Back
			</Button>
		{:else}
			<span></span>
		{/if}
		<Button variant="ghost" size="sm" onclick={handleCancel}>Cancel</Button>
	</div>

	<!-- Header / progress -->
	<div class="mb-4">
		<h1 class="text-2xl font-semibold">New Product</h1>
		<p class="text-sm text-muted-foreground">
			Step {currentStep + 1} of {stepsAll.length} — {stepsAll[currentStep]}
		</p>
	</div>

	<div class="mb-6 flex gap-1">
		{#each stepsAll as s, i (s)}
			<div
				class="h-1.5 flex-1 rounded-full {i <= currentStep ? 'bg-foreground' : 'bg-border'}"
				aria-label={s}
			></div>
		{/each}
	</div>

	<!-- Two-column grid -->
	<div class="grid items-start gap-10 lg:grid-cols-[1fr_320px]">
		<!-- Left: form -->
		<form method="POST" use:enhance>
			<!-- ═══ STEP 1: General ═══ -->
			{#if currentStep === 0}
				<!-- Style -->
				<div class="mb-6">
					<h2 class="text-lg font-medium">Style</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						What it's called and how it's referenced.
					</p>
					<div class="mt-3.5 grid grid-cols-2 gap-3">
						<div>
							<Label>Product name</Label>
							<Input
								class="mt-1.5"
								placeholder="e.g. Linen Button-Down Shirt"
								bind:value={$form.name}
							/>
							{#if $errors.name}
								<p class="mt-1 text-sm text-destructive">{$errors.name[0]}</p>
							{/if}
						</div>
						<div>
							<Label>Style number</Label>
							<Input class="mt-1.5" placeholder="e.g. VR-2001" bind:value={$form.styleNumber} />
							<p class="mt-1 text-xs text-muted-foreground">
								Unique within this brand. Buyers reference this on POs.
							</p>
							{#if $errors.styleNumber}
								<p class="mt-1 text-sm text-destructive">{$errors.styleNumber[0]}</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Season -->
				<div class="mb-6 border-t border-dashed border-border pt-6">
					<h2 class="text-lg font-medium">Season</h2>
					<p class="mt-1 text-sm text-muted-foreground">When this style is being sold in.</p>
					<div class="mt-3.5 grid grid-cols-[2fr_1fr_1fr] gap-3">
						<div>
							<Label>
								Season <span class="text-sm font-normal text-muted-foreground">(optional)</span>
							</Label>
							<SelectField class="mt-1.5 w-full" items={seasonItems} bind:value={$form.seasonId} />
						</div>
						<div>
							<Label>Year</Label>
							<Input
								type="number"
								class="mt-1.5"
								min={2000}
								max={2100}
								value={$form.productYear ?? new Date().getFullYear()}
								oninput={(e) => {
									const v = (e.target as HTMLInputElement).value;
									$form.productYear = v ? parseInt(v, 10) : null;
								}}
							/>
						</div>
						<div>
							<Label>
								Category
								<span class="text-sm font-normal text-muted-foreground">(optional)</span>
							</Label>
							<Input class="mt-1.5" placeholder="Tops, Bottoms…" bind:value={$form.category} />
						</div>
					</div>
				</div>

				<!-- Pricing -->
				<div class="mb-6 border-t border-dashed border-border pt-6">
					<h2 class="text-lg font-medium">Pricing</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Wholesale is required; retail is optional and shown to buyers as MSRP.
					</p>
					<div class="mt-3.5 grid grid-cols-2 gap-3">
						<div>
							<Label>Wholesale</Label>
							<div class="mt-1.5 flex border border-border bg-card">
								<span
									class="flex items-center border-r border-border bg-muted px-2.5 font-mono text-sm text-muted-foreground"
									>$</span
								>
								<input
									type="number"
									step="0.01"
									min="0"
									placeholder="0.00"
									class="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm"
									bind:value={$form.wholesalePrice}
								/>
							</div>
							{#if $errors.wholesalePrice}
								<p class="mt-1 text-sm text-destructive">{$errors.wholesalePrice[0]}</p>
							{/if}
						</div>
						<div>
							<Label>
								Retail (MSRP)
								<span class="text-sm font-normal text-muted-foreground">(optional)</span>
							</Label>
							<div class="mt-1.5 flex border border-border bg-card">
								<span
									class="flex items-center border-r border-border bg-muted px-2.5 font-mono text-sm text-muted-foreground"
									>$</span
								>
								<input
									type="number"
									step="0.01"
									min="0"
									placeholder="0.00"
									class="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm"
									bind:value={$form.retailPrice}
								/>
							</div>
						</div>
					</div>
				</div>

				<!-- Status -->
				<div class="mb-6 border-t border-dashed border-border pt-6">
					<h2 class="text-lg font-medium">Status</h2>
					<p class="mt-1 text-sm text-muted-foreground">How this product surfaces to buyers.</p>
					<div class="mt-3.5 flex flex-col gap-2">
						<!-- ATS -->
						<div
							class="flex gap-3 border p-3.5 {$form.ats
								? 'border-foreground bg-background'
								: 'border-border bg-card'}"
						>
							<Checkbox bind:checked={$form.ats} />
							<div>
								<label class="text-sm font-medium">Available to ship (ATS)</label>
								<p class="mt-0.5 text-sm text-muted-foreground">
									In stock and shippable now. Turn off for futures or pre-orders. Inventory inputs
									only appear when this is on.
								</p>
							</div>
						</div>
						<!-- Featured -->
						<div
							class="flex gap-3 border p-3.5 {$form.featured
								? 'border-foreground bg-background'
								: 'border-border bg-card'}"
						>
							<Checkbox bind:checked={$form.featured} />
							<div>
								<label class="text-sm font-medium">Featured</label>
								<p class="mt-0.5 text-sm text-muted-foreground">
									Surfaces on the brand homepage and in seasonal pickers.
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="flex items-center justify-end border-t border-border pt-4.5">
					<Button disabled={!step1Valid} onclick={nextStep}>Continue to Sizes & Variants</Button>
				</div>

				<!-- ═══ STEP 2: Sizes & Variants ═══ -->
			{:else if currentStep === 1}
				<!-- Sizes -->
				<div class="mb-6">
					<h2 class="text-lg font-medium">Sizes</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Pick the size run this style is offered in. You can add custom values alongside the
						preset.
					</p>
					<div class="mt-3.5">
						<SizePicker
							sizeMode={$form.sizeMode}
							sizes={$form.sizes}
							onSizeModeChange={(m) => ($form.sizeMode = m)}
							onSizesChange={(s) => ($form.sizes = s)}
						/>
					</div>
					{#if $errors.sizes}
						<p class="mt-1 text-sm text-destructive">{$errors.sizes[0]}</p>
					{/if}
				</div>

				<!-- Variants -->
				<div class="mb-6 border-t border-dashed border-border pt-6">
					<div class="flex items-center justify-between gap-4">
						<div class="min-w-0">
							<h2 class="text-lg font-medium">Variants</h2>
							<p class="text-sm text-muted-foreground">
								Switch on to add multiple color variations of this product.
							</p>
						</div>
						<label class="flex shrink-0 items-center gap-2.5">
							<span class="text-sm font-medium">Add variants</span>
							<Switch
								checked={$form.hasVariants}
								onCheckedChange={(checked) => {
									$form.hasVariants = checked;
									if (checked && $form.variants.length === 0) {
										addVariant();
									}
								}}
							/>
						</label>
					</div>

					{#if !$form.hasVariants}
						<!-- No-variant: product-level images -->
						<div class="mt-4.5">
							<h3 class="text-[15px] font-medium">
								Product images
								<span class="text-sm font-normal text-muted-foreground">(no variants)</span>
							</h3>
							<p class="mt-1 text-sm text-muted-foreground">
								Two images. The primary is shown on the catalog grid; the secondary appears on
								hover.
							</p>
							<div class="mt-3">
								<ImagePair
									primaryFile={productPrimaryImage}
									hoverFile={productHoverImage}
									onPrimaryChange={(f) => (productPrimaryImage = f)}
									onHoverChange={(f) => (productHoverImage = f)}
								/>
							</div>
						</div>

						{#if $form.ats}
							<!-- No-variant inventory -->
							<div class="mt-6 border-t border-dashed border-border pt-6">
								<h3 class="text-[15px] font-medium">Inventory</h3>
								<p class="mt-1 text-sm text-muted-foreground">
									Stock count per size. Leave blank for sizes that don't track inventory.
								</p>
								{#if $form.sizes.length > 0}
									<div class="mt-3">
										<InventoryMatrix
											sizes={$form.sizes}
											skuPrefix={$form.styleNumber}
											inventory={$form.productInventory}
											stockThreshold={$form.stockThreshold}
											onInventoryChange={(inv) => ($form.productInventory = inv)}
											onThresholdChange={(t) => ($form.stockThreshold = t)}
										/>
									</div>
								{:else}
									<p class="mt-3 text-sm text-muted-foreground">
										Select sizes above to enter inventory.
									</p>
								{/if}
							</div>
						{:else}
							<!-- ATS off hint -->
							<div
								class="mt-4.5 flex gap-2.5 border-l-2 border-foreground bg-muted px-3.5 py-2.5 text-sm"
							>
								<span class="font-mono text-sm text-muted-foreground">ats off</span>
								<span>
									Pre-order or futures style. Inventory inputs hidden — buyers can place orders
									without stock counts.
								</span>
							</div>
						{/if}
					{:else}
						<!-- Variant rows -->
						<div class="mt-4.5 flex flex-col gap-2">
							{#each $form.variants as variant (variant.id)}
								<VariantRow
									variant={{ ...variant, images: getVariantImages(variant.id) }}
									expanded={expandedVariantId === variant.id}
									sizes={$form.sizes}
									styleNumber={$form.styleNumber}
									ats={$form.ats}
									onToggle={() => {
										expandedVariantId = expandedVariantId === variant.id ? null : variant.id;
									}}
									onChange={(updated) => {
										const { images: updatedImages, ...rest } = updated;
										variantImages.set(variant.id, updatedImages);
										$form.variants = $form.variants.map((v) =>
											v.id === rest.id ? { ...v, ...rest } : v
										);
									}}
									onSetPrimary={() => setPrimaryVariant(variant.id)}
									onRemove={() => removeVariant(variant.id)}
								/>
							{/each}
						</div>

						<button
							type="button"
							class="mt-2 flex w-full items-center justify-center gap-1.5 border border-dashed border-border/60 p-3 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
							onclick={addVariant}
						>
							<span class="text-lg font-light">+</span> Add another color
						</button>

						{#if $form.variants.length > 0 && $form.sizes.length > 0}
							<div
								class="mt-2 border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground"
							>
								<strong class="text-foreground"
									>{$form.variants.length} color{$form.variants.length !== 1 ? 's' : ''}</strong
								>
								·
								<strong class="text-foreground"
									>{$form.sizes.length} size{$form.sizes.length !== 1 ? 's' : ''}</strong
								>
								· creates
								<strong class="text-foreground"
									>{$form.variants.length * $form.sizes.length} variants</strong
								>
								on save.
							</div>
						{/if}

						{#if $errors.variants}
							<p class="mt-1 text-sm text-destructive">{$errors.variants[0]}</p>
						{/if}
					{/if}
				</div>

				<!-- Footer -->
				<div class="flex items-center justify-end border-t border-border pt-4.5">
					<Button disabled={!step2Valid()} onclick={nextStep}>Continue to Description</Button>
				</div>

				<!-- ═══ STEP 3: Description ═══ -->
			{:else if currentStep === 2}
				<div class="mb-6">
					<h2 class="text-lg font-medium">Description</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						What buyers see when they open the product. Materials, fit, styling, care.
					</p>
					<div class="mt-3.5">
						<Label>
							Product description
							<span class="text-sm font-normal text-muted-foreground">(optional)</span>
						</Label>
						<textarea
							class="mt-1.5 min-h-[120px] w-full resize-y border border-border bg-background px-2.5 py-2 text-sm"
							placeholder="A relaxed boyfriend cut in midweight European linen…"
							bind:value={$form.description}
						></textarea>
					</div>
				</div>

				<!-- Footer -->
				<div class="flex items-center justify-end border-t border-border pt-4.5">
					<Button type="submit" loading={$submitting}>Create product</Button>
				</div>
			{/if}
		</form>

		<!-- Right: preview -->
		<aside class="sticky top-6 hidden lg:block">
			<ProductCardPreview
				name={$form.name}
				styleNumber={$form.styleNumber}
				wholesalePrice={$form.wholesalePrice}
				retailPrice={$form.retailPrice}
				ats={$form.ats}
				featured={$form.featured}
				hasVariants={$form.hasVariants}
				variants={$form.variants.map((v) => ({
					colorHex: v.colorHex,
					isPrimary: v.isPrimary,
					images: { primary: variantImages.get(v.id)?.primary ?? null }
				}))}
				{productPrimaryImage}
			/>
		</aside>
	</div>
</div>
