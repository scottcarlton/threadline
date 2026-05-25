# Product Detail Page Redesign

**Date:** 2026-05-05
**Branch:** threadline-refinement-v1
**Mockup:** `.superpowers/brainstorm/86688-1778027391/content/full-page-final.html`

## Summary

Redesign `/products/[productId]` to support inline editing, a variant stock matrix, clearer product lifecycle actions, and better information hierarchy. The left image column and product header stay as-is — changes are to the right-column content below the header.

## What stays the same

- Left image column: primary image (4:5), sub-images (front/back grid), hover replace/remove controls
- Meta banner: style number, Active/Archived badge, product name, brand · season line, wholesale price (large), retail price (below wholesale)
- Variant thumbnails: row of color thumbnails below meta banner, active state border

## Changes

### 1. Inline editing

**Trigger:** "Edit" button in top-right. Entering edit mode makes the following fields contenteditable with a dotted bottom border (no `<input>` elements):

- Style number
- Product name
- Wholesale price
- Retail price (always visible in edit mode — shows `$0.00` when empty)
- Description

Season and year become dropdown selects. Category/subcategory become dropdown selects (at their position near the bottom). A Save/Cancel bar appears at the bottom of the right column.

The old full-form edit card is removed entirely.

### 2. Variant matrix

Replace the flat variant list with a color × size matrix table:

- **Header row:** `color | xs | s | m | l | xl | xxl | total | ...`
- **Color rows:** swatch + color name, stock quantity per size cell
- **Footer row:** total per size column, grand total
- **Stock highlighting (ATS only):**
  - Yellow background: low stock (at or below threshold)
  - Red background: out of stock (0)
  - Dash (`—`): size doesn't exist for that color
- **Pre-order products (non-ATS):** same matrix layout, checkmarks instead of quantities. No stock summary badges.
- **Header right:** "X in stock" + "Y low" badges (ATS only)
- **Row menu (`...`):** per-color-row actions (remove color, edit SKUs, etc.)
- No `+ Add color` button in the matrix — the `[+]` thumbnail is the single entry point.

### 3. Add variant via `[+]` thumbnail

A dotted `[+]` box after the last variant thumbnail in the thumbnail strip. Clicking opens a modal for adding a new color + size run. This is the single entry point for adding variants — no duplicate add button in the matrix.

Modal title and copy disambiguate from "add image" on first use (e.g., "Add Variant — choose a color and size run").

### 4. Product lifecycle actions

**Top-right actions:** "Edit" button + `...` overflow menu containing:

- Archive (toggles archived_at, flips is_active)
- Delete (with confirmation dialog — permanent removal)

Archive and Delete are deliberate actions, not casually accessible buttons.

**Three states:** Active → Archived → Delete (permanent)

### 5. Bottom metadata section

At the bottom of the right column, separated by a border-top:

- **Left:** "Updated by [name] · [date]" — requires adding `updated_by` column to products table
- **Right:** ATS toggle + Featured toggle (both low-priority, mostly system-driven)

### 6. Categories deprioritized

Category/subcategory shown as a single text line near the bottom, above the metadata row. In edit mode, they become dropdown selects. No category badge in the product header.

### 7. Velocity cards removed

The 30-day / 90-day / velocity stat cards are removed from the product detail page.

## Schema changes

- Add `updated_by UUID REFERENCES auth.users(id)` to `products` table
- Populate `updated_by` in the save action alongside `updated_at`

## Out of scope

- Expected delivery dates or minimum order quantities on pre-order variants
- Variant SKU inline editing in the matrix (handled via row `...` menu)
- Image upload/management changes (left column stays as-is)
- Mobile layout (will adapt naturally but not explicitly designed here)
