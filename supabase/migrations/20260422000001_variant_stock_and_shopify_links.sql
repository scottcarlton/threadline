-- Variant-grain stock tracking + Shopify linkage.
-- NULL stock_qty means "no signal yet" — UI renders no pill.
-- stock_threshold is optional; when set and qty <= threshold => "low-stock".

ALTER TABLE product_variants
  ADD COLUMN stock_qty INTEGER NULL CHECK (stock_qty IS NULL OR stock_qty >= 0),
  ADD COLUMN stock_threshold INTEGER NULL CHECK (stock_threshold IS NULL OR stock_threshold > 0),
  ADD COLUMN shopify_variant_id TEXT NULL,
  ADD COLUMN shopify_inventory_item_id TEXT NULL;

ALTER TABLE products
  ADD COLUMN shopify_product_id TEXT NULL;

-- Partial non-unique indexes — lookup performance for sync/webhook paths.
-- Shopify IDs are per-store (not globally unique), so uniqueness is enforced in
-- application code at sync time within each org's scope (Task 16).
CREATE INDEX product_variants_shopify_variant_id_idx
  ON product_variants (shopify_variant_id)
  WHERE shopify_variant_id IS NOT NULL;

CREATE INDEX products_shopify_product_id_idx
  ON products (shopify_product_id)
  WHERE shopify_product_id IS NOT NULL;

-- Webhook-path lookup: route inventory_levels/update to the right variant.
CREATE INDEX product_variants_shopify_inventory_item_id_idx
  ON product_variants (shopify_inventory_item_id)
  WHERE shopify_inventory_item_id IS NOT NULL;

-- Fast filter for UI queries that only want variants with a tracked qty.
CREATE INDEX product_variants_stock_qty_idx
  ON product_variants (stock_qty)
  WHERE stock_qty IS NOT NULL;

COMMENT ON COLUMN product_variants.stock_qty IS
  'Nullable. NULL = no stock signal; integer = current available qty (summed across Shopify locations when mirrored).';

COMMENT ON COLUMN product_variants.shopify_variant_id IS
  'Presence means this variant is mirrored from Shopify. Threadline UI must not allow direct edits to stock_qty when set.';

COMMENT ON COLUMN product_variants.shopify_inventory_item_id IS
  'Shopify InventoryItem GID (distinct from the variant GID). Used by the inventory_levels/update webhook to route stock updates to the right local variant.';
