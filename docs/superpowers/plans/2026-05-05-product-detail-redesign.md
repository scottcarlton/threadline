# Product Detail Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/products/[productId]` with inline editing, a variant stock matrix, overflow lifecycle menu, and bottom metadata section.

**Architecture:** The page stays as a single SvelteKit route. The variant matrix is extracted into its own component (`VariantMatrix.svelte`). The add-variant flow is extracted into a dialog component (`AddVariantModal.svelte`). Inline editing uses `contenteditable` divs toggled by an `editing` state flag. A new migration adds `updated_by` to `products`.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), Bits UI (Dialog, DropdownMenu, Select, Switch), Tailwind CSS v4, Supabase

**Spec:** `docs/superpowers/specs/2026-05-05-product-detail-redesign.md`

---

### Task 1: Add `updated_by` column to products

**Files:**

- Create: `supabase/migrations/20260505000001_products_updated_by.sql`
- Modify: `src/lib/types/database.ts` (Product interface)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260505000001_products_updated_by.sql
ALTER TABLE products ADD COLUMN updated_by UUID REFERENCES auth.users(id);
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd /Users/scottcarlton/Sites/threadline/.worktrees/threadline-refinement-v1 && bunx supabase db push --local`
Expected: Migration applies successfully.

- [ ] **Step 3: Update the Product interface**

In `src/lib/types/database.ts`, add `updated_by` to the `Product` interface:

```typescript
export interface Product {
	id: string;
	organization_id: string;
	brand_id: string;
	style_number: string;
	name: string;
	description: string | null;
	wholesale_price: number;
	retail_price: number | null;
	category: string | null;
	subcategory: string | null;
	season_id: string | null;
	product_year: number | null;
	ats: boolean;
	is_featured: boolean;
	shopify_product_id: string | null;
	is_active: boolean;
	archived_at: string | null;
	created_at: string;
	updated_at: string;
	updated_by: string | null;
}
```

- [ ] **Step 4: Run type check**

Run: `bun run check`
Expected: 0 errors (or only pre-existing unrelated errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260505000001_products_updated_by.sql src/lib/types/database.ts
git commit -m "feat: add updated_by column to products table"
```

---

### Task 2: Build the VariantMatrix component

**Files:**

- Create: `src/lib/components/products/VariantMatrix.svelte`
- Reference: `src/lib/inventory/status.ts` (deriveStockStatus)
- Reference: `src/lib/types/database.ts` (ProductVariant)

This component renders the color × size stock matrix table. It receives the product's variants and `ats` flag as props, groups variants by color, and renders the matrix with stock highlighting for ATS products or checkmarks for pre-order products.

- [ ] **Step 1: Create the component**

Create `src/lib/components/products/VariantMatrix.svelte`:

```svelte
<script lang="ts">
	import type { ProductVariant } from '$lib/types/database.js';
	import { deriveStockStatus } from '$lib/inventory/status';

	type Props = {
		variants: ProductVariant[];
		ats: boolean;
	};

	let { variants, ats }: Props = $props();

	type ColorGroup = {
		color: string | null;
		colorHex: string | null;
		sizes: Map<string, ProductVariant>;
	};

	const allSizes = $derived(() => {
		const sizeSet = new Set<string>();
		for (const v of variants) {
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

	const colorGroups = $derived(() => {
		const map = new Map<string, ColorGroup>();
		for (const v of variants) {
			const key = v.color ?? '__none__';
			if (!map.has(key)) {
				map.set(key, { color: v.color, colorHex: v.color_hex, sizes: new Map() });
			}
			if (v.size) {
				map.get(key)!.sizes.set(v.size, v);
			}
		}
		return [...map.values()];
	});

	const totalStock = $derived(() => {
		return variants.reduce((sum, v) => sum + (v.stock_qty ?? 0), 0);
	});

	const lowCount = $derived(() => {
		return variants.filter((v) => {
			const status = deriveStockStatus(v.stock_qty, v.stock_threshold);
			return status === 'low' || status === 'out';
		}).length;
	});

	function rowTotal(group: ColorGroup): number {
		let sum = 0;
		for (const v of group.sizes.values()) {
			sum += v.stock_qty ?? 0;
		}
		return sum;
	}

	function colTotal(size: string): number {
		let sum = 0;
		for (const group of colorGroups()) {
			const v = group.sizes.get(size);
			if (v) sum += v.stock_qty ?? 0;
		}
		return sum;
	}
</script>

<div class="mt-7">
	<div class="mb-3.5 flex items-baseline justify-between">
		<div class="flex items-baseline gap-1.5">
			<h3 class="text-base font-semibold">Variants</h3>
			<span class="text-sm text-muted-foreground">({variants.length})</span>
		</div>
		{#if ats}
			<div class="flex items-center gap-3">
				<span class="text-sm font-medium">{totalStock()} in stock</span>
				{#if lowCount() > 0}
					<span
						class="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
					>
						{lowCount()} low
					</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if variants.length === 0}
		<p class="text-sm text-muted-foreground">
			No variants yet. Add a color and size run to get started.
		</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border">
						<th class="px-3 py-2.5 text-left text-sm font-normal text-muted-foreground">color</th>
						{#each allSizes() as size (size)}
							<th class="w-14 px-2 py-2.5 text-center text-sm font-normal text-muted-foreground">
								{size.toLowerCase()}
							</th>
						{/each}
						{#if ats}
							<th class="w-16 px-2 py-2.5 text-center text-sm font-medium text-foreground">total</th
							>
						{/if}
						<th class="w-9"></th>
					</tr>
				</thead>
				<tbody>
					{#each colorGroups() as group (group.color ?? '__none__')}
						<tr class="border-b border-border/50">
							<td class="px-3 py-3.5">
								<div class="flex items-center gap-2.5">
									{#if group.colorHex}
										<div
											class="h-6 w-6 shrink-0 rounded"
											style="background: {group.colorHex};"
										></div>
									{/if}
									<span class="font-medium">{group.color ?? 'Default'}</span>
								</div>
							</td>
							{#each allSizes() as size (size)}
								{@const variant = group.sizes.get(size)}
								<td class="px-2 py-3.5 text-center">
									{#if !variant}
										<span class="text-muted-foreground/40">&mdash;</span>
									{:else if ats}
										{@const status = deriveStockStatus(variant.stock_qty, variant.stock_threshold)}
										{#if status === 'out'}
											<span
												class="rounded bg-red-100 px-2 py-0.5 font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400"
											>
												0
											</span>
										{:else if status === 'low'}
											<span
												class="rounded bg-amber-100 px-2 py-0.5 font-medium dark:bg-amber-900/30"
											>
												{variant.stock_qty}
											</span>
										{:else}
											{variant.stock_qty}
										{/if}
									{:else}
										<span class="text-emerald-600">&#10003;</span>
									{/if}
								</td>
							{/each}
							{#if ats}
								<td class="px-2 py-3.5 text-center font-semibold">{rowTotal(group)}</td>
							{/if}
							<td class="px-2 py-3.5 text-center">
								<button class="text-muted-foreground transition-colors hover:text-foreground"
									>&middot;&middot;&middot;</button
								>
							</td>
						</tr>
					{/each}
				</tbody>
				{#if ats}
					<tfoot>
						<tr class="border-t border-border">
							<td class="px-3 py-3 text-sm text-muted-foreground">total per size</td>
							{#each allSizes() as size (size)}
								<td class="px-2 py-3 text-center text-muted-foreground">{colTotal(size)}</td>
							{/each}
							<td class="px-2 py-3 text-center font-bold">{totalStock()}</td>
							<td></td>
						</tr>
					</tfoot>
				{/if}
			</table>
		</div>
	{/if}
</div>
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/products/VariantMatrix.svelte
git commit -m "feat: add VariantMatrix component for color×size stock grid"
```

---

### Task 3: Build the AddVariantModal component

**Files:**

- Create: `src/lib/components/products/AddVariantModal.svelte`
- Reference: Current inline add-variant logic in `src/routes/products/[productId]/+page.svelte` (lines 132–187)
- Reference: `src/lib/components/ui/dialog/index.ts`
- Reference: `src/lib/components/ui/input/index.ts`
- Reference: `src/lib/components/ui/button/index.ts`

Extract the current add-variant form into a standalone dialog. The modal is opened by the `[+]` thumbnail. It handles color name, color hex picker, size selection (letter/numeric toggle + custom), and submits via supabase client insert.

- [ ] **Step 1: Create the component**

Create `src/lib/components/products/AddVariantModal.svelte`:

```svelte
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { supabase } from '$lib/supabase.js';
	import { invalidateAll } from '$app/navigation';

	type Props = {
		open: boolean;
		productId: string;
		onOpenChange?: (open: boolean) => void;
	};

	let { open = $bindable(false), productId, onOpenChange }: Props = $props();

	let newColor = $state('');
	let newColorHex = $state('#000000');
	const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
	const numberedSizes = ['0', '2', '4', '6', '8', '10', '12', '14'];
	let selectedSizes = $state<Set<string>>(new Set());
	let sizeMode = $state<'letter' | 'number'>('letter');
	let customSize = $state('');
	let saving = $state(false);

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

	function reset() {
		newColor = '';
		newColorHex = '#000000';
		selectedSizes = new Set();
		customSize = '';
		saving = false;
	}

	async function submit() {
		if (!newColor.trim() && selectedSizes.size === 0) return;
		saving = true;

		const sizes = Array.from(selectedSizes);
		const rows: { product_id: string; color: string | null; size: string | null }[] = [];

		if (newColor.trim() && sizes.length > 0) {
			for (const size of sizes) {
				rows.push({ product_id: productId, color: newColor.trim(), size });
			}
		} else if (newColor.trim()) {
			rows.push({ product_id: productId, color: newColor.trim(), size: null });
		} else if (sizes.length > 0) {
			for (const size of sizes) {
				rows.push({ product_id: productId, color: null, size });
			}
		}

		if (rows.length > 0) {
			await supabase.from('product_variants').insert(rows);
		}

		reset();
		open = false;
		onOpenChange?.(false);
		invalidateAll();
	}

	function handleOpenChange(isOpen: boolean) {
		if (!isOpen) reset();
		open = isOpen;
		onOpenChange?.(isOpen);
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.DialogContent class="max-w-lg p-6">
		<Dialog.DialogTitle class="text-lg font-semibold">Add Variant</Dialog.DialogTitle>
		<Dialog.DialogDescription class="mt-1 text-sm text-muted-foreground">
			Add a new color and size run to this product.
		</Dialog.DialogDescription>

		<div class="mt-6 space-y-5">
			<!-- Color -->
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
						class="rounded-md px-3 py-1 text-sm font-medium transition-colors {sizeMode === 'letter'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground'}"
						onclick={() => (sizeMode = 'letter')}
					>
						Letter
					</button>
					<button
						class="rounded-md px-3 py-1 text-sm font-medium transition-colors {sizeMode === 'number'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground'}"
						onclick={() => (sizeMode = 'number')}
					>
						Numeric
					</button>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each sizeMode === 'letter' ? commonSizes : numberedSizes as size (size)}
						<button
							class="flex h-9 w-11 items-center justify-center rounded-lg border-2 text-sm font-medium transition-all {selectedSizes.has(
								size
							)
								? 'border-primary bg-primary/10 text-primary'
								: 'border-muted text-muted-foreground hover:border-foreground/20'}"
							onclick={() => toggleSize(size)}
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
							<button class="text-sm text-primary" onclick={addCustomSize}>Add</button>
						{/if}
					</div>
				</div>
			</div>

			{#if newColor.trim() && selectedSizes.size > 0}
				<p class="text-sm text-muted-foreground">
					This will create <span class="font-medium text-foreground">{selectedSizes.size}</span>
					variant{selectedSizes.size > 1 ? 's' : ''} for {newColor.trim()}
				</p>
			{/if}
		</div>

		<div class="mt-6 flex justify-end gap-2">
			<Button variant="outline" onclick={() => handleOpenChange(false)}>Cancel</Button>
			<Button onclick={submit} disabled={saving || (!newColor.trim() && selectedSizes.size === 0)}>
				{saving ? 'Adding...' : 'Add Variants'}
			</Button>
		</div>
	</Dialog.DialogContent>
</Dialog.Root>
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/products/AddVariantModal.svelte
git commit -m "feat: extract add-variant flow into AddVariantModal dialog"
```

---

### Task 4: Update the server load and save action

**Files:**

- Modify: `src/routes/products/[productId]/+page.server.ts`

Changes:

1. Join `profiles` on `updated_by` to get the updater's display name
2. Set `updated_by` in the save action
3. Remove the velocity query (cards removed from spec)
4. Add a `delete` action

- [ ] **Step 1: Rewrite the server file**

Replace the contents of `src/routes/products/[productId]/+page.server.ts` with:

```typescript
import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, `/shop/${params.productId}`);
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const { data: product, error: productErr } = await supabase
		.from('products')
		.select(
			'*, product_variants(*), product_images(*), seasons(name), profiles:updated_by(display_name)'
		)
		.eq('id', params.productId)
		.single();
	if (productErr || !product) throw error(404, 'Product not found');

	const { data: brand } = await supabase
		.from('brands')
		.select('id, name')
		.eq('id', product.brand_id)
		.single();
	if (!brand) throw error(404, 'Brand not found for this product');

	const seasonsRes = await supabase
		.from('seasons')
		.select('id, name')
		.eq('organization_id', product.organization_id)
		.eq('is_active', true)
		.order('name');

	return {
		brand,
		product,
		seasons: seasonsRes.data ?? []
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		const { organization, membership, user } = locals;
		if (!organization || !['admin', 'owner', 'member'].includes(membership?.role ?? '')) {
			return fail(403, { error: 'Not allowed' });
		}

		const fd = await request.formData();
		const nn = (v: string | null) => (v && v.length ? v : null);

		const { error: updateErr } = await supabaseAdmin
			.from('products')
			.update({
				style_number: fd.get('style_number') as string,
				name: fd.get('name') as string,
				description: nn(fd.get('description') as string),
				wholesale_price: parseFloat((fd.get('wholesale_price') as string) || '0'),
				retail_price: parseFloat((fd.get('retail_price') as string) || '0') || null,
				category: nn(fd.get('category') as string),
				subcategory: nn(fd.get('subcategory') as string),
				season_id: nn(fd.get('season_id') as string),
				product_year: parseInt((fd.get('product_year') as string) || '0', 10) || null,
				ats: fd.get('ats') === 'true',
				is_featured: fd.get('is_featured') === 'true',
				updated_at: new Date().toISOString(),
				updated_by: user?.id ?? null
			})
			.eq('id', params.productId);

		if (updateErr) {
			return fail(500, { error: updateErr.message });
		}

		return { success: true };
	},

	delete: async ({ locals, params }) => {
		const { organization, membership } = locals;
		if (!organization || !['admin', 'owner'].includes(membership?.role ?? '')) {
			return fail(403, { error: 'Not allowed' });
		}

		const { error: deleteErr } = await supabaseAdmin
			.from('products')
			.delete()
			.eq('id', params.productId);

		if (deleteErr) {
			return fail(500, { error: deleteErr.message });
		}

		throw redirect(303, '/products');
	}
};
```

- [ ] **Step 2: Verify type check**

Run: `bun run check`
Expected: 0 errors. If the `profiles:updated_by` join has type issues, cast it in the page component (Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/routes/products/[productId]/+page.server.ts
git commit -m "feat: update product server — add updated_by, delete action, remove velocity"
```

---

### Task 5: Rewrite the product detail page

**Files:**

- Modify: `src/routes/products/[productId]/+page.svelte`
- Reference: `src/lib/components/products/VariantMatrix.svelte` (Task 2)
- Reference: `src/lib/components/products/AddVariantModal.svelte` (Task 3)
- Reference: `src/lib/components/ui/switch.svelte`
- Reference: `src/lib/components/ui/select/select-field.svelte`
- Reference: `src/lib/components/ui/dialog/index.ts`

This is the main task. The page is rewritten to:

1. Replace the Edit/Archive buttons with Edit + `...` overflow menu (Archive, Delete)
2. Make title, style number, prices, description contenteditable in edit mode
3. Show retail price as `$0.00` in edit mode when empty
4. Add `[+]` dotted thumbnail that opens AddVariantModal
5. Replace the flat variant list with VariantMatrix
6. Move categories to a deprioritized text line near bottom
7. Add bottom metadata row: "Updated by X · date" + ATS/Featured switches
8. Add a delete confirmation dialog
9. Remove velocity cards and the old edit form card
10. Show Save/Cancel bar at the bottom of the right column in edit mode

- [ ] **Step 1: Rewrite the page**

Replace the contents of `src/routes/products/[productId]/+page.svelte` with:

```svelte
<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { SvelteMap } from 'svelte/reactivity';
	import { DropdownMenu, Dialog } from 'bits-ui';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import SelectField from '$lib/components/ui/select/select-field.svelte';
	import VariantMatrix from '$lib/components/products/VariantMatrix.svelte';
	import AddVariantModal from '$lib/components/products/AddVariantModal.svelte';
	import type { Product, ProductVariant, ProductImage } from '$lib/types/database.js';

	let { data } = $props();
	const product = $derived(
		data.product as Product & {
			product_variants: ProductVariant[];
			product_images: ProductImage[];
			seasons: { name?: string } | { name?: string }[] | null;
			profiles: { display_name: string | null } | null;
		}
	);
	const seasons = $derived(data.seasons as { id: string; name: string }[]);

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
	const canDelete = $derived(['admin', 'owner'].includes(data.membership?.role ?? ''));

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

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
	let saveError = $state('');
	let saving = $state(false);

	// Modal states
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
		editing = true;
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
		const fd = new FormData();
		try {
			const res = await fetch('?/delete', { method: 'POST', body: fd });
			if (!res.ok) {
				deleting = false;
				return;
			}
			await goto('/products');
		} catch {
			deleting = false;
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

	// Updated by display
	const updatedByName = $derived(() => {
		const p = product.profiles as { display_name: string | null } | null;
		return p?.display_name ?? null;
	});

	const updatedAtFormatted = $derived(() => {
		if (!product.updated_at) return null;
		return new Date(product.updated_at).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	});

	// Season items for select
	const seasonItems = $derived([
		{ value: '', label: 'None' },
		...seasons.map((s) => ({ value: s.id, label: s.name }))
	]);
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
				<div class="mb-1 flex items-center gap-2">
					{#if editing}
						<span
							contenteditable="true"
							role="textbox"
							class="border-b-2 border-dotted border-muted-foreground/40 pb-0.5 font-mono text-sm text-muted-foreground outline-none"
							oninput={(e) => (editStyle = (e.currentTarget as HTMLElement).textContent ?? '')}
							>{editStyle}</span
						>
					{:else}
						<span class="font-mono text-sm text-muted-foreground">{product.style_number}</span>
					{/if}
					<Badge variant={product.archived_at ? 'destructive' : 'success'}>
						{product.archived_at ? 'Archived' : 'Active'}
					</Badge>
				</div>
				{#if editing}
					<h2
						contenteditable="true"
						role="textbox"
						class="border-b-2 border-dotted border-muted-foreground/40 pb-0.5 text-xl font-semibold outline-none"
						oninput={(e) => (editName = (e.currentTarget as HTMLElement).textContent ?? '')}
					>
						{editName}
					</h2>
					<div class="mt-2 flex items-center gap-2">
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
							class="h-[44px] w-20 rounded-xs border border-input bg-background px-3 text-sm"
						/>
					</div>
				{:else}
					<h2 class="text-xl font-semibold">{product.name}</h2>
					{#if product.season_id || product.product_year}
						{@const seasonJoin = product.seasons as { name?: string } | { name?: string }[] | null}
						{@const seasonName = Array.isArray(seasonJoin) ? seasonJoin[0]?.name : seasonJoin?.name}
						{@const seasonYear = [seasonName, product.product_year].filter(Boolean).join(' ')}
						{#if seasonYear}
							<div class="mt-1 text-sm text-muted-foreground">{seasonYear}</div>
						{/if}
					{/if}
				{/if}
			</div>
			<div class="shrink-0 text-right">
				{#if editing}
					<p class="text-sm text-muted-foreground">Wholesale</p>
					<p
						contenteditable="true"
						role="textbox"
						class="border-b-2 border-dotted border-muted-foreground/40 pb-0.5 text-xl font-semibold outline-none"
						oninput={(e) => {
							const raw = (e.currentTarget as HTMLElement).textContent ?? '';
							editWholesale = raw.replace(/[^0-9.]/g, '');
						}}
					>
						${editWholesale}
					</p>
					<p class="mt-2 text-sm text-muted-foreground">Retail</p>
					<p
						contenteditable="true"
						role="textbox"
						class="border-b-2 border-dotted border-muted-foreground/40 pb-0.5 text-base font-medium outline-none"
						oninput={(e) => {
							const raw = (e.currentTarget as HTMLElement).textContent ?? '';
							editRetail = raw.replace(/[^0-9.]/g, '');
						}}
					>
						${editRetail}
					</p>
				{:else}
					<p class="text-sm text-muted-foreground">Wholesale</p>
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
		<div class="min-w-0 space-y-0">
			<!-- Desktop: meta banner -->
			<div class="hidden lg:block">
				{@render metaBanner()}
			</div>

			<!-- Variant thumbnails -->
			<div class="mt-4 flex gap-1.5">
				{#each variantThumbnails as thumb, i (thumb.id)}
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
				<div class="mt-5">
					<p
						contenteditable="true"
						role="textbox"
						class="min-h-[3rem] border-b-2 border-dotted border-muted-foreground/40 pb-1 text-sm leading-relaxed text-muted-foreground outline-none"
						oninput={(e) => (editDescription = (e.currentTarget as HTMLElement).textContent ?? '')}
					>
						{editDescription || ''}
					</p>
				</div>
			{:else if product.description}
				<p class="mt-5 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
			{/if}

			{#if saveError}
				<div class="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{saveError}
				</div>
			{/if}

			<!-- Variant Matrix -->
			<VariantMatrix variants={product.product_variants ?? []} ats={product.ats} />

			<!-- Categories (deprioritized) -->
			{#if editing}
				<div
					class="mt-6 flex items-center gap-3 border-t border-border pt-4 text-sm text-muted-foreground"
				>
					<span>Category:</span>
					<input
						type="text"
						bind:value={editCategory}
						placeholder="Category"
						class="h-9 w-32 rounded-xs border border-input bg-background px-2.5 text-sm"
					/>
					<input
						type="text"
						bind:value={editSubcategory}
						placeholder="Subcategory"
						class="h-9 w-32 rounded-xs border border-input bg-background px-2.5 text-sm"
					/>
				</div>
			{:else if product.category}
				<div class="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
					Category: <span class="text-foreground"
						>{product.category}{product.subcategory ? ` / ${product.subcategory}` : ''}</span
					>
				</div>
			{/if}

			<!-- Bottom metadata -->
			<div class="mt-4 flex items-center justify-between border-t border-border pt-4">
				<div class="text-sm text-muted-foreground">
					{#if updatedByName() || updatedAtFormatted()}
						{#if updatedByName()}Updated by {updatedByName()}{/if}
						{#if updatedByName() && updatedAtFormatted()}
							·
						{/if}
						{#if updatedAtFormatted()}{updatedAtFormatted()}{/if}
					{/if}
				</div>
				<div class="flex items-center gap-5">
					{#if editing}
						<label class="flex items-center gap-2 text-sm text-muted-foreground">
							<Switch bind:checked={editFeatured} />
							Featured
						</label>
						<label class="flex items-center gap-2 text-sm text-muted-foreground">
							<Switch bind:checked={editAts} />
							ATS
						</label>
					{:else}
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							{#if product.is_featured}
								<Badge variant="secondary">Featured</Badge>
							{/if}
							{#if product.ats}
								<Badge variant="secondary">ATS</Badge>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Save / Cancel bar (edit mode) -->
			{#if editing}
				<div class="mt-5 flex justify-end gap-2 border-t border-border pt-4">
					<Button variant="outline" onclick={cancelEdit}>Cancel</Button>
					<Button onclick={saveEdit} disabled={saving}>
						{saving ? 'Saving…' : 'Save'}
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Add Variant Modal -->
<AddVariantModal bind:open={addVariantOpen} productId={product.id} />

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={deleteConfirmOpen}>
	<Dialog.DialogContent class="max-w-sm p-6">
		<Dialog.DialogTitle class="text-lg font-semibold">Delete Product</Dialog.DialogTitle>
		<Dialog.DialogDescription class="mt-2 text-sm text-muted-foreground">
			This will permanently delete <span class="font-medium text-foreground">{product.name}</span> and
			all its variants. This action cannot be undone.
		</Dialog.DialogDescription>
		<div class="mt-6 flex justify-end gap-2">
			<Button variant="outline" onclick={() => (deleteConfirmOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={deleteProduct} disabled={deleting}>
				{deleting ? 'Deleting…' : 'Delete'}
			</Button>
		</div>
	</Dialog.DialogContent>
</Dialog.Root>
```

- [ ] **Step 2: Run type check**

Run: `bun run check`
Expected: 0 errors. Fix any type issues with the `profiles` join or Dialog/DropdownMenu imports.

- [ ] **Step 3: Run tests**

Run: `bun run test:run`
Expected: All tests pass.

- [ ] **Step 4: Start dev server and test in browser**

Run: `bun run dev`

Test these flows:

1. View mode renders: meta banner, variant thumbnails with `[+]`, description, variant matrix, categories, bottom metadata
2. Click Edit: fields become contenteditable with dotted underlines, retail shows `$0.00` if empty, season/year become dropdowns, ATS/Featured become switches, Save/Cancel bar appears
3. Click `...` menu: Archive and Delete appear
4. Click Delete: confirmation dialog opens
5. Click `[+]` thumbnail: AddVariantModal opens
6. Variant matrix: colors as rows, sizes as columns, stock highlighting for ATS products

- [ ] **Step 5: Commit**

```bash
git add src/routes/products/[productId]/+page.svelte
git commit -m "feat: redesign product detail — inline editing, variant matrix, lifecycle menu"
```

---

### Task 6: Clean up unused code

**Files:**

- Modify: `src/routes/products/[productId]/+page.svelte` — verify no leftover imports
- Check: `src/lib/components/inventory/VariantStockEditor.svelte` — check if used elsewhere; if only used on this page, note it but don't delete (may be used on other routes)
- Check: `src/lib/components/ui/card/` imports — verify removed from the page since we no longer use Card for the edit form or details

- [ ] **Step 1: Verify no unused imports in the page**

Run: `bun run check`

Look for warnings about unused imports. The following should no longer be imported on this page:

- `Card`, `CardHeader`, `CardTitle`, `CardContent`
- `Input` (edit form no longer uses Input for the main fields — only used in categories; check if still needed)
- `Label`
- `StockPill`
- `VariantStockEditor`

If any remain, remove them.

- [ ] **Step 2: Check VariantStockEditor usage across codebase**

Run: `grep -rn "VariantStockEditor" src/ --include="*.svelte"`

If only referenced in the old page code (now removed), note it's unused but don't delete — it may be needed for the `brands/[id]/products/[productId]` route which we haven't touched.

- [ ] **Step 3: Run full checks**

Run: `bun run check && bun run test:run`
Expected: 0 type errors, all tests pass.

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore: clean up unused imports from product detail redesign"
```

---

### Summary of file changes

| Action  | File                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------- |
| Create  | `supabase/migrations/20260505000001_products_updated_by.sql`                                   |
| Create  | `src/lib/components/products/VariantMatrix.svelte`                                             |
| Create  | `src/lib/components/products/AddVariantModal.svelte`                                           |
| Modify  | `src/lib/types/database.ts` (add `updated_by` to Product)                                      |
| Modify  | `src/routes/products/[productId]/+page.server.ts` (join profiles, add delete, remove velocity) |
| Rewrite | `src/routes/products/[productId]/+page.svelte` (full redesign)                                 |
