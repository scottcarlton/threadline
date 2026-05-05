# Refactor: Create Product flow → 3-step stepper

## Goal

Replace the current 5-step create-product flow with a 3-step stepper matching `docs/wireframes/create-product-stepper.html`. Add an inline live preview, an explicit variants switch, and inline inventory entry. Functional + layout refactor only — styling, tokens, and component primitives follow existing conventions.

## Key design decision: variant = color (UI) vs color × size (DB)

- **UI concept:** a "variant" is a color. Sizes are inventory rows nested inside each color.
- **DB storage:** one `product_variants` row per (color × size). This is the flat model that maps 1:1 to Shopify (`shopify_variant_id`, `shopify_inventory_item_id`) and every other inventory/ERP system that tracks stock at the SKU level.
- **Translation layer:** the server action fans out `colors × sizes` into flat rows on save. Load functions group rows by color for display. The form never exposes the flat model to the user.

## Files in scope

- `src/routes/products/new/+page.svelte` — brand-org create route, rewrite to use shared component
- `src/routes/products/new/+page.server.ts` — add Zod schema validation + form action
- `src/routes/brands/[id]/products/new/+page.svelte` — rep-org create route, rewrite to use same shared component
- `src/routes/brands/[id]/products/new/+page.server.ts` — add Zod schema validation + form action
- `src/lib/schemas/product.ts` — **new file**, Zod schema for the create form
- `src/lib/components/products/` — **existing directory** (has import components), add new extracted components
- `src/routes/api/products/[productId]/images/+server.ts` — update POST to accept `variant_id` and `role` metadata
- `src/lib/server/products/upload-image.ts` — update to persist `variant_id` and `role` on the `product_images` row

## Reference patterns

- **Stepper** — `src/routes/orders/new/+page.svelte` lines 1133-1148: top Back/Cancel row, h1, "Step X of Y — {stepName}" subtitle, `h-1.5 flex-1 rounded-full` progress bars filled when `i <= currentStep`.
- **Forms** — `src/routes/accounts/new/` is the canonical Zod + sveltekit-superforms reference. Use `superValidate(zod4(schema))` server-side and `superForm(data.form, { validators: zod4Client(schema), validationMethod: 'onblur', dataType: 'json', onUpdated, onError })` client-side.
- **UI primitives** — `src/lib/components/ui/`. Use `ui/select`, `ui/switch`, `ui/checkbox`, `ui/input`, `ui/label`, `ui/button`. No native `<select>`, checkboxes, etc.
- **Stock derivation** — `src/lib/inventory/status.ts` (`deriveStockStatus`) and `src/lib/components/inventory/StockPill.svelte`.

## State shape

```ts
type CreateProductForm = {
	// Step 1
	name: string;
	styleNumber: string;
	seasonId?: string;
	productYear?: number;
	category?: string;
	wholesalePrice: number;
	retailPrice?: number;
	ats: boolean;
	featured: boolean;

	// Step 2
	sizeMode: 'letter' | 'numeric';
	sizes: string[]; // e.g. ['S','M','L','XL']

	hasVariants: boolean;

	// hasVariants === false  ->  product-level images + optional inventory
	productImages?: {
		primary?: File;
		hover?: File;
	};
	productInventory?: Record<string, number | null>; // size -> qty (only when ats)
	stockThreshold?: number | null;

	// hasVariants === true  ->  per-color images + optional inventory
	// UI concept: each entry here is a "color variant"
	// DB reality: each entry fans out to N rows in product_variants (one per size)
	variants?: Array<{
		id: string; // local UUID for keying
		colorName: string;
		colorHex?: string;
		isPrimary: boolean; // exactly one must be true
		images: {
			primary?: File;
			hover?: File;
		};
		inventory: Record<string, number | null>; // size -> qty (only when ats)
		stockThreshold?: number | null;
	}>;

	// Step 3
	description?: string;
};
```

## Step-by-step requirements

### Step 1 — General

Fields in order:

1. **Style** section
   - Product name _(required)_
   - Style number _(required)_ — unique per brand; helper: "Unique within this brand. Buyers reference this on POs."
2. **Season** section
   - Season _(optional)_ — `ui/select` populated from `data.seasons`
   - Year _(optional)_ — number input, defaults to current year
   - Category _(optional)_ — text input
3. **Pricing** section
   - Wholesale _(required)_ — number input with `$` prefix
   - Retail (MSRP) _(optional)_ — same shape
4. **Status** section
   - ATS — `ui/checkbox` row, default off. Helper: "In stock and shippable now. Turn off for futures or pre-orders. Inventory inputs only appear when this is on."
   - Featured — `ui/checkbox` row, default off. Helper: "Surfaces on the brand homepage and in seasonal pickers."

Footer: `Continue to Sizes & Variants` (primary). Continue is enabled only when required fields pass `zod4Client` validation.

### Step 2 — Sizes & Variants

1. **Sizes** section (always visible)
   - Two-button toggle: `Letter | Numeric`
     - Letter: `XS, S, M, L, XL, XXL`
     - Numeric: `0, 2, 4, 6, 8, 10, 12, 14`
   - Each size renders as a clickable pill that toggles selection
   - Trailing input always allows adding ad-hoc custom sizes alongside whichever preset is active
2. **Variants** section
   - Heading: `<h2>Variants</h2>` + subtitle on left; `Add variants` label + `ui/switch` on right, vertically centered
   - When **off** (`hasVariants === false`):
     - **Product images** sub-section — two image slots: `primary` (grid image), `hover` (hover image). Helper: "JPG or PNG. 4:5 ratio recommended. Max 5MB each."
     - When ATS on: **Inventory** sub-section — one row per selected size showing `{size, sku (autogen read-only), qty input}`. SKU pattern: `{styleNumber}-{SIZE}`. Trailing low-stock threshold input.
     - When ATS off: no inventory inputs; show hint banner: "Pre-order or futures style. Inventory inputs hidden."
   - When **on** (`hasVariants === true`):
     - Variant list. Each row collapsed by default: swatch circle, color name, status meta (`{n}/2 images · {n} sizes` or `Incomplete`), expand caret. Click to expand; **only one row open at a time** (auto-collapse siblings).
     - Expanded row:
       - Color name _(required)_ + Hex _(optional)_ with color picker bound to hex text input
       - Two image slots: `primary` + `hover`
       - When ATS on: inventory matrix per size + low-stock threshold for this color. SKU pattern: `{styleNumber}-{COLOR_SLUG}-{SIZE}`
       - "Use as primary color" `ui/checkbox` (exactly one variant primary; selecting it unsets others) + `Remove color` destructive button
     - Below list: dashed `+ Add another color` button. Adds row, auto-expands it, collapses siblings, focuses color name input.
   - Removing the last variant while `hasVariants === true` is allowed; Continue disables until at least one exists.

Footer: `Back`, `Continue to Description`.

### Step 3 — Description

- Single textarea: Product description _(optional)_. Helper: "Plain text."
- Footer: `Back`, `Create product` (primary). Submit triggers form action.

## Layout

- Page wrapper mirrors `/orders/new`: top Back/Cancel row, h1 ("New Product"), `Step X of 3 — {stepName}` subtitle, progress bars.
- Two-column grid on `>= lg`:
  - **Left:** active step's form content
  - **Right:** sticky live preview card
  - On smaller screens: preview stacks above form

## Live preview card

Extract into `src/lib/components/products/ProductCardPreview.svelte`. Binds to form state:

- `name` -> card title (fallback "Product name")
- `styleNumber` -> style # line + image placeholder text (fallback "STYLE-000")
- `wholesalePrice` -> primary price (fallback "$0")
- `retailPrice` -> strikethrough MSRP (hidden when blank or 0)
- `hasVariants && variants.length` -> swatch circles; up to 5 + "+N" overflow. When `hasVariants === false`, no swatches.
- `ats === true` -> `StockPill` with status `'in'` as top-left badge
- `featured === true` -> "Featured" pill next to stock pill
- When an image `File` is present, render `URL.createObjectURL()` preview in the image area

Preview-only component for now (static image, not carousel). Carousel wired up later.

## Server action + persistence

Single form action on both `+page.server.ts` files. On submit:

1. `superValidate(request, zod4(createProductSchema))`. If invalid -> `fail(400, { form })`.
2. Insert into `products` (name, style_number, description, wholesale_price, retail_price, category, season_id, product_year, ats, is_featured, organization_id, brand_id).
3. Build variant rows (fan-out from UI color model to flat DB rows):
   - `hasVariants === false`: insert one `product_variants` row per selected size with `color = null`, `color_hex = null`, `sku = '{styleNumber}-{SIZE}'`, `stock_qty` and `stock_threshold` from inventory (or null if ATS off).
   - `hasVariants === true`: for each color, insert one `product_variants` row per size. `color = colorName`, `color_hex = hex`, `sku = '{styleNumber}-{COLOR_SLUG}-{SIZE}'`, per-cell `stock_qty`, per-color `stock_threshold`.
4. Image upload — POST to `/api/products/{productId}/images` with `variant_id` (the first variant row for that color, or null for no-variant case) and `role` (`'primary'` or `'hover'`). The endpoint writes these to the new `product_images` columns.
5. On success: `throw redirect(303, '/products/{productId}')` for brand orgs, `throw redirect(303, '/brands/{brandId}/products/{productId}')` for rep orgs.
6. On partial success (product saved but image upload failed): `return message(form, { kind: 'partial', productId, failedImages })` and have the client toast + navigate.

**Image upload is optional for now** — no validation blocking submit. Note for production: require at least the primary image.

## Schema migrations

```sql
-- products: featured flag
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS products_is_featured_idx
  ON products (organization_id, is_featured) WHERE is_featured = TRUE;

-- product_variants: hex swatch value
-- (color, size, sku, stock_qty, stock_threshold already exist)
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex TEXT;

-- product_images: link to variant + distinguish primary vs hover
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('primary', 'hover'));
CREATE INDEX IF NOT EXISTS product_images_variant_role_idx
  ON product_images (product_id, variant_id, role);
```

**Why `variant_id` FK instead of `color text`:** linking by variant row prevents ambiguity if two colors share a name. The first variant row for a color group serves as the anchor. `ON DELETE SET NULL` so deleting a variant doesn't cascade-delete images.

**Existing columns (no migration needed):** `products.ats`, `products.product_year`, `product_variants.color`, `product_variants.size`, `product_variants.sku`, `product_variants.stock_qty`, `product_variants.stock_threshold`.

Update `src/lib/types/database.ts` to add `is_featured` to Product, `color_hex` to ProductVariant, and `variant_id` + `role` to ProductImage.

## Component decomposition

- `src/lib/components/products/CreateProductForm.svelte` — the full stepper, used by both routes
- `src/lib/components/products/SizePicker.svelte` — size mode toggle + pills + custom input, bindable `sizes: string[]`
- `src/lib/components/products/VariantRow.svelte` — collapsed/expanded color variant editor (accordion)
- `src/lib/components/products/InventoryMatrix.svelte` — size x qty grid + threshold input
- `src/lib/components/products/ImagePair.svelte` — primary + hover upload slots with preview/remove
- `src/lib/components/products/ProductCardPreview.svelte` — live preview card driven by form state

## Tests

- `src/lib/schemas/product.ts` — required fields, conditional inventory when `ats === true`, exactly one primary variant, at least one variant when `hasVariants === true`
- `SizePicker` — pill toggle adds/removes from array, custom additions persist
- `+page.server.ts` action — correct variant row count for no-variant vs color-variant cases; ATS off writes null stock; image upload failure returns `message(form, ...)` not redirect

Run `bun run check` and `bun run test:run` before claiming done.

## Out of scope

- Detail page / inline edit redesign
- Bulk import from line sheet
- Buyer-side / shop changes
- Catalog grid layout changes (only extracting the card component)
- Save draft / `is_draft` column (deferred)
- Image-required validation (deferred to production)

## Open items to decide before merging

1. **SKU autogen** — wireframe shows `{STYLE}-{SIZE}` (no-variant) and `{STYLE}-{COLOR_SLUG}-{SIZE}` (variants). Today's form leaves SKU blank. Recommend autogen at insert time, display read-only in inventory matrix, users edit later from detail page. Slug strategy: uppercase, strip spaces/accents.

## Acceptance criteria

- Both `/products/new` and `/brands/[id]/products/new` use the shared `CreateProductForm.svelte` component.
- 3-step stepper replaces the 5-step wizard.
- Variants switch toggles between no-variant and color-variant blocks. Switching preserves data on both sides.
- ATS toggle in step 1 controls inventory input visibility in step 2. Toggling off keeps values in state but hides inputs (writes null on save).
- Submit creates: 1 `products` row, N `product_variants` rows (one per color x size), and 0-2 `product_images` rows per color/product (with `variant_id` FK and `role`).
- Live preview card reflects edits in real time.
- `bun run check` at 0 errors. New tests pass.
- All form controls use `src/lib/components/ui/` primitives.
- Image upload is optional (no validation blocking submit).
