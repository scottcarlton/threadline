# Product Attributes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow brands to tag products with attributes (Recycled Materials, Organic, Ethically Sourced, etc.) during creation and editing, and display those attributes to buyers in the shop.

**Architecture:** Add a `text[]` column to the `products` table to store attribute slugs. Define a canonical list of suggested attributes in a shared constant file, but allow brands to type custom values too. The UI uses a multi-select chip picker on Step 3 (Description) of the create form, an inline edit section on the product detail page, and badge display on the buyer-facing shop page.

**Tech Stack:** Supabase migration (Postgres `text[]`), Zod schema update, SvelteKit form + server actions, Tailwind styling, Bits UI components.

---

## File Structure

| Action | Path                                                           | Responsibility                                      |
| ------ | -------------------------------------------------------------- | --------------------------------------------------- |
| Create | `supabase/migrations/20260506000001_product_attributes.sql`    | Add `attributes text[] default '{}'` column         |
| Create | `src/lib/data/product-attributes.ts`                           | Canonical attribute list with labels and categories |
| Modify | `src/lib/types/database.ts:503-524`                            | Add `attributes: string[]` to `Product` interface   |
| Modify | `src/lib/schemas/product.ts`                                   | Add `attributes` field to `createProductSchema`     |
| Create | `src/lib/components/products/AttributePicker.svelte`           | Reusable chip-based multi-select for attributes     |
| Modify | `src/lib/components/products/CreateProductForm.svelte:585-608` | Add AttributePicker to Step 3 (Description)         |
| Modify | `src/routes/products/new/+page.server.ts:73-90`                | Pass `attributes` into product insert               |
| Modify | `src/routes/products/[productId]/+page.svelte:543-559`         | Add attribute display/edit to detail page           |
| Modify | `src/routes/products/[productId]/+page.server.ts:65-82`        | Include `attributes` in save action                 |
| Modify | `src/routes/shop/[productId]/+page.svelte:193-204`             | Display attribute badges to buyers                  |
| Create | `src/lib/data/product-attributes.test.ts`                      | Tests for attribute helpers                         |

---

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/20260506000001_product_attributes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add product attributes (sustainability, material sourcing, production method, etc.)
ALTER TABLE products ADD COLUMN attributes TEXT[] DEFAULT '{}';
```

- [ ] **Step 2: Apply the migration locally**

Run: `bunx supabase db reset` (or `bunx supabase migration up` if you want incremental)
Expected: Migration applies cleanly, `products.attributes` column exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260506000001_product_attributes.sql
git commit -m "feat: add attributes column to products table"
```

---

### Task 2: Canonical Attribute List

**Files:**

- Create: `src/lib/data/product-attributes.ts`
- Create: `src/lib/data/product-attributes.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/lib/data/product-attributes.test.ts
import { describe, it, expect } from 'vitest';
import {
	PRODUCT_ATTRIBUTES,
	getAttributeLabel,
	getAttributesByCategory
} from './product-attributes';

describe('product-attributes', () => {
	it('every attribute has a unique value', () => {
		const values = PRODUCT_ATTRIBUTES.map((a) => a.value);
		expect(new Set(values).size).toBe(values.length);
	});

	it('every attribute has a non-empty label and category', () => {
		for (const attr of PRODUCT_ATTRIBUTES) {
			expect(attr.label.length).toBeGreaterThan(0);
			expect(attr.category.length).toBeGreaterThan(0);
		}
	});

	it('getAttributeLabel returns label for known value', () => {
		expect(getAttributeLabel('recycled_materials')).toBe('Recycled Materials');
	});

	it('getAttributeLabel returns the raw value for unknown slug', () => {
		expect(getAttributeLabel('custom_thing')).toBe('custom_thing');
	});

	it('getAttributesByCategory groups correctly', () => {
		const grouped = getAttributesByCategory();
		expect(Object.keys(grouped).length).toBeGreaterThan(0);
		for (const [category, attrs] of Object.entries(grouped)) {
			expect(category.length).toBeGreaterThan(0);
			expect(attrs.length).toBeGreaterThan(0);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run -- src/lib/data/product-attributes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/data/product-attributes.ts

export interface ProductAttribute {
	value: string;
	label: string;
	category: string;
}

export const PRODUCT_ATTRIBUTES: ProductAttribute[] = [
	// Sustainability
	{ value: 'recycled_materials', label: 'Recycled Materials', category: 'Sustainability' },
	{ value: 'organic_materials', label: 'Organic Materials', category: 'Sustainability' },
	{ value: 'ethically_sourced', label: 'Ethically Sourced', category: 'Sustainability' },
	{ value: 'fair_trade', label: 'Fair Trade Certified', category: 'Sustainability' },
	{ value: 'vegan', label: 'Vegan / Cruelty-Free', category: 'Sustainability' },
	{ value: 'biodegradable', label: 'Biodegradable', category: 'Sustainability' },

	// Production
	{ value: 'handmade', label: 'Handmade / Artisan', category: 'Production' },
	{ value: 'made_in_usa', label: 'Made in USA', category: 'Production' },
	{ value: 'small_batch', label: 'Small Batch', category: 'Production' },
	{ value: 'limited_edition', label: 'Limited Edition', category: 'Production' },

	// Material
	{ value: 'natural_fibers', label: 'Natural Fibers', category: 'Material' },
	{ value: 'performance_fabric', label: 'Performance Fabric', category: 'Material' },
	{ value: 'deadstock_fabric', label: 'Deadstock Fabric', category: 'Material' }
];

const labelMap = new Map(PRODUCT_ATTRIBUTES.map((a) => [a.value, a.label]));

export function getAttributeLabel(value: string): string {
	return labelMap.get(value) ?? value;
}

export function getAttributesByCategory(): Record<string, ProductAttribute[]> {
	const grouped: Record<string, ProductAttribute[]> = {};
	for (const attr of PRODUCT_ATTRIBUTES) {
		(grouped[attr.category] ??= []).push(attr);
	}
	return grouped;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run -- src/lib/data/product-attributes.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/product-attributes.ts src/lib/data/product-attributes.test.ts
git commit -m "feat: add canonical product attribute list with helpers"
```

---

### Task 3: Update TypeScript Types and Zod Schema

**Files:**

- Modify: `src/lib/types/database.ts:503-524`
- Modify: `src/lib/schemas/product.ts`

- [ ] **Step 1: Add `attributes` to the Product interface**

In `src/lib/types/database.ts`, add after `updated_by: string | null;` (line 523):

```ts
attributes: string[];
```

- [ ] **Step 2: Add `attributes` to the Zod schema**

In `src/lib/schemas/product.ts`, add inside the `createProductSchema` object (after the `description` field):

```ts
attributes: z.array(z.string().trim().min(1).max(100)).max(20).default([]);
```

This caps at 20 attributes per product and 100 chars per custom attribute value.

- [ ] **Step 3: Run type check**

Run: `bun run check`
Expected: 0 errors (or only pre-existing unrelated errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/database.ts src/lib/schemas/product.ts
git commit -m "feat: add attributes field to Product type and Zod schema"
```

---

### Task 4: AttributePicker Component

**Files:**

- Create: `src/lib/components/products/AttributePicker.svelte`

This component renders the canonical attributes grouped by category as toggleable chips. It also has a text input to add custom attribute values not in the predefined list.

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/products/AttributePicker.svelte -->
<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import {
		PRODUCT_ATTRIBUTES,
		getAttributesByCategory,
		getAttributeLabel
	} from '$lib/data/product-attributes';

	type Props = {
		selected: string[];
		onchange: (selected: string[]) => void;
		disabled?: boolean;
	};

	let { selected, onchange, disabled = false }: Props = $props();

	const grouped = getAttributesByCategory();

	let customInput = $state('');

	function toggle(value: string) {
		if (disabled) return;
		if (selected.includes(value)) {
			onchange(selected.filter((v) => v !== value));
		} else {
			onchange([...selected, value]);
		}
	}

	function addCustom() {
		const trimmed = customInput.trim();
		if (!trimmed || disabled) return;
		const slug = trimmed
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_|_$/g, '');
		if (!slug || selected.includes(slug)) {
			customInput = '';
			return;
		}
		onchange([...selected, slug]);
		customInput = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addCustom();
		}
	}

	const knownValues = new Set(PRODUCT_ATTRIBUTES.map((a) => a.value));
	const customSelected = $derived(selected.filter((v) => !knownValues.has(v)));
</script>

<div class="flex flex-col gap-4">
	{#each Object.entries(grouped) as [category, attrs] (category)}
		<div>
			<p class="mb-2 text-sm font-medium text-muted-foreground">{category}</p>
			<div class="flex flex-wrap gap-1.5">
				{#each attrs as attr (attr.value)}
					<button
						type="button"
						class="border px-3 py-1.5 text-sm transition-colors {selected.includes(attr.value)
							? 'border-foreground bg-foreground text-background'
							: 'border-border bg-card text-foreground hover:border-foreground/50'}"
						{disabled}
						onclick={() => toggle(attr.value)}
					>
						{attr.label}
					</button>
				{/each}
			</div>
		</div>
	{/each}

	{#if customSelected.length > 0}
		<div>
			<p class="mb-2 text-sm font-medium text-muted-foreground">Custom</p>
			<div class="flex flex-wrap gap-1.5">
				{#each customSelected as value (value)}
					<button
						type="button"
						class="border border-foreground bg-foreground px-3 py-1.5 text-sm text-background transition-colors"
						{disabled}
						onclick={() => toggle(value)}
					>
						{getAttributeLabel(value)} ×
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="flex gap-2">
		<Input
			placeholder="Add custom attribute…"
			class="max-w-[240px]"
			bind:value={customInput}
			{disabled}
			onkeydown={handleKeydown}
		/>
		<button
			type="button"
			class="border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
			{disabled}
			onclick={addCustom}
		>
			Add
		</button>
	</div>
</div>
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/products/AttributePicker.svelte
git commit -m "feat: add AttributePicker chip-based multi-select component"
```

---

### Task 5: Wire Attributes into Create Product Flow

**Files:**

- Modify: `src/lib/components/products/CreateProductForm.svelte:585-608`
- Modify: `src/routes/products/new/+page.server.ts:73-90`

- [ ] **Step 1: Add AttributePicker to Step 3 of CreateProductForm**

In `src/lib/components/products/CreateProductForm.svelte`, add the import at the top of the `<script>` block (after the existing product component imports around line 19):

```ts
import AttributePicker from './AttributePicker.svelte';
```

Then in the Step 3 section (after the description `<textarea>` closing `</div>` around line 601, before the footer), add:

```svelte
<!-- Attributes -->
<div class="mt-6 border-t border-dashed border-border pt-6">
	<h2 class="text-lg font-medium">Attributes</h2>
	<p class="mt-1 text-sm text-muted-foreground">
		Tag this product with relevant attributes. Buyers see these on the product page.
	</p>
	<div class="mt-3.5">
		<AttributePicker selected={$form.attributes} onchange={(v) => ($form.attributes = v)} />
	</div>
</div>
```

- [ ] **Step 2: Pass attributes in the server insert**

In `src/routes/products/new/+page.server.ts`, add `attributes` to the product insert object (after the `is_featured: d.featured` line around line 87):

```ts
attributes: d.attributes.length > 0 ? d.attributes : [];
```

- [ ] **Step 3: Test in browser**

Run: `bun run dev`
Navigate to `/products/new`, go through to Step 3.

- Verify the attribute picker renders below the description textarea.
- Toggle a few attributes on/off, add a custom one.
- Create a product and verify `attributes` is saved (check Supabase Studio or query the DB).

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/products/CreateProductForm.svelte src/routes/products/new/+page.server.ts
git commit -m "feat: wire attribute picker into create product step 3"
```

---

### Task 6: Wire Attributes into Product Detail Page (Edit)

**Files:**

- Modify: `src/routes/products/[productId]/+page.svelte:543-559`
- Modify: `src/routes/products/[productId]/+page.server.ts:65-82`

- [ ] **Step 1: Add attribute display and editing to the detail page**

In `src/routes/products/[productId]/+page.svelte`:

1. Add imports at the top of the `<script>` block:

```ts
import AttributePicker from '$lib/components/products/AttributePicker.svelte';
import { getAttributeLabel } from '$lib/data/product-attributes';
```

2. Add edit state (near the other `let edit*` state vars around line 111):

```ts
let editAttributes = $state<string[]>([]);
```

3. In the `startEditing` function (the block that sets `editDescription`, etc.), add:

```ts
editAttributes = [...(product.attributes ?? [])];
```

4. After the Description section (around line 559, before `<!-- Save error -->`), add:

```svelte
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
				<span class="border border-border px-2.5 py-1 text-sm">{getAttributeLabel(attr)}</span>
			{/each}
		</div>
	</div>
{/if}
```

- [ ] **Step 2: Send attributes in the save FormData**

In `src/routes/products/[productId]/+page.svelte`, find where the save `FormData` is built (the `fd.set(...)` calls around line 150). Add:

```ts
fd.set('attributes', JSON.stringify(editAttributes));
```

- [ ] **Step 3: Handle attributes in the server save action**

In `src/routes/products/[productId]/+page.server.ts`, inside the `save` action's `.update({...})` block, add:

```ts
attributes: JSON.parse((fd.get('attributes') as string) || '[]');
```

- [ ] **Step 4: Test in browser**

Navigate to an existing product at `/products/<id>`.

- Click Edit, verify attributes section appears.
- Toggle attributes, save, verify they persist on reload.
- Verify non-editing view shows attribute badges.

- [ ] **Step 5: Commit**

```bash
git add src/routes/products/[productId]/+page.svelte src/routes/products/[productId]/+page.server.ts
git commit -m "feat: add attribute editing to product detail page"
```

---

### Task 7: Display Attributes on Buyer-Facing Shop Page

**Files:**

- Modify: `src/routes/shop/[productId]/+page.svelte:193-204`

- [ ] **Step 1: Add attribute badge display**

In `src/routes/shop/[productId]/+page.svelte`, add the import at the top of the `<script>` block:

```ts
import { getAttributeLabel } from '$lib/data/product-attributes';
```

After the description block (around line 195, before the category badges), add:

```svelte
{#if product.attributes && product.attributes.length > 0}
	<div class="flex flex-wrap gap-1.5">
		{#each product.attributes as attr (attr)}
			<span class="border border-border px-2.5 py-1 text-sm">{getAttributeLabel(attr)}</span>
		{/each}
	</div>
{/if}
```

- [ ] **Step 2: Test in browser**

Navigate to `/shop/<productId>` for a product that has attributes.

- Verify badges render between description and category.
- Verify no badges render for products without attributes.

- [ ] **Step 3: Commit**

```bash
git add src/routes/shop/[productId]/+page.svelte
git commit -m "feat: display product attributes on buyer shop page"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run type check**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 2: Run tests**

Run: `bun run test:run`
Expected: All tests pass including the new `product-attributes.test.ts`.

- [ ] **Step 3: Full browser walkthrough**

1. Create a new product via `/products/new` — select 3 attributes on Step 3, create it.
2. Open the product detail page — verify attributes display as badges.
3. Edit the product — toggle an attribute off, add a custom one, save.
4. Open the shop view as a buyer — verify attributes show between description and category.

- [ ] **Step 4: Commit any fixes, then final commit if needed**

```bash
git add -A
git commit -m "chore: final verification and cleanup for product attributes"
```
