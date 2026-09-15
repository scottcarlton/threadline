-- Buyer cart: persist quantities and colour selection (SCO-167)
--
-- 20260424000001_cart_items.sql stored only product_id, so a rehydrated cart
-- came back with every quantity at zero and every colour reset to the first
-- variant. The client cart has always been keyed by (productId, selectedColor)
-- -- see cartKey() in src/lib/stores/cart.ts -- so the old
-- UNIQUE (profile_id, product_id) also collapsed two colourways of the same
-- style into one row.
--
-- No backfill: existing rows carry no quantity data worth preserving. They keep
-- selected_color = '' and size_qtys = '{}', which the layout load treats the
-- same way it treated every row before this migration.

ALTER TABLE cart_items
  ADD COLUMN selected_color TEXT NOT NULL DEFAULT '',
  ADD COLUMN size_qtys JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- size_qtys is a flat { size: quantity } map. Guard the shape here so a bad
-- write cannot poison rehydration for the whole cart.
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_size_qtys_is_object
  CHECK (jsonb_typeof(size_qtys) = 'object');

ALTER TABLE cart_items DROP CONSTRAINT cart_items_profile_id_product_id_key;

ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_profile_product_color_key
  UNIQUE (profile_id, product_id, selected_color);

COMMENT ON COLUMN cart_items.selected_color IS
  'Colourway this line is for. Empty string when the product has no colour variants; part of the uniqueness key so one style can sit in the cart in several colours.';
COMMENT ON COLUMN cart_items.size_qtys IS
  'Flat { size: quantity } map for this product/colour line. Sizes with no quantity are omitted rather than stored as 0.';

-- update_updated_at() is the shared helper from 20260418000013_email_intake.sql.
CREATE TRIGGER cart_items_set_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Quantity edits are updates, not inserts. Without this policy the only way to
-- change a line under RLS is delete + re-insert.
CREATE POLICY "Users update own cart"
  ON cart_items FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
