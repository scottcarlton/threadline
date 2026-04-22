-- Variant-grain stock tracking + Shopify linkage.
-- NULL stock_qty means "no signal yet" — UI renders no pill.
-- stock_threshold is optional; when set and qty <= threshold => "low-stock".

ALTER TABLE product_variants
  ADD COLUMN stock_qty INTEGER NULL,
  ADD COLUMN stock_threshold INTEGER NULL,
  ADD COLUMN shopify_variant_id TEXT NULL,
  ADD COLUMN shopify_inventory_item_id TEXT NULL;

ALTER TABLE products
  ADD COLUMN shopify_product_id TEXT NULL;

-- Partial unique indexes: same Shopify IDs can't collide within an org.
-- (Different orgs can each have their own Shopify store with the same numeric IDs.)
CREATE UNIQUE INDEX product_variants_shopify_variant_unique
  ON product_variants (shopify_variant_id)
  WHERE shopify_variant_id IS NOT NULL;

CREATE UNIQUE INDEX products_shopify_product_unique
  ON products (shopify_product_id)
  WHERE shopify_product_id IS NOT NULL;

-- Index used by the decrement trigger + UI queries.
CREATE INDEX product_variants_stock_qty_idx
  ON product_variants (stock_qty)
  WHERE stock_qty IS NOT NULL;

COMMENT ON COLUMN product_variants.stock_qty IS
  'Nullable. NULL = no stock signal; integer = current available qty (summed across Shopify locations when mirrored).';

COMMENT ON COLUMN product_variants.shopify_variant_id IS
  'Presence means this variant is mirrored from Shopify. Threadline UI must not allow direct edits to stock_qty when set.';
