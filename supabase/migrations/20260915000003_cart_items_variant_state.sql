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
--
-- ───────────────────────────────────────────────────────────────────────────
-- Renumbered from 20260915000001, and written to be re-runnable
-- ───────────────────────────────────────────────────────────────────────────
--
-- This shipped as `20260915000001_cart_items_variant_state.sql` in PR #312,
-- while `20260915000001_invoice_payments.sql` had already merged in PR #311
-- under the same version. `supabase_migrations.schema_migrations` has `version`
-- as its primary key, so two files at one version is not a style problem: on a
-- clean database `supabase start` aborts outright with
--
--     ERROR: duplicate key value violates unique constraint
--     "schema_migrations_pkey"  Key (version)=(20260915000001) already exists.
--
-- which is what took the RLS job red on `dev` and on every open PR from the
-- moment #312 merged. `invoice_payments` keeps the original version because it
-- merged first and is the one already recorded in existing databases.
--
-- Every statement below is guarded, which matters more than the rename. On
-- databases that already ran this body under the old version -- the local
-- development database demonstrably did, columns present while
-- schema_migrations credits the version to invoice_payments -- a plain rename
-- would make it re-run and fail on `ADD COLUMN`. Guarded, it is a no-op there
-- and records the new version cleanly, so nobody needs a
-- `supabase migration repair` to get unstuck.
--
-- On a fresh database the effect is identical to the original.

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS selected_color TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size_qtys JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- size_qtys is a flat { size: quantity } map. Guard the shape here so a bad
-- write cannot poison rehydration for the whole cart.
--
-- ADD CONSTRAINT has no IF NOT EXISTS, so the existence check is explicit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cart_items'::regclass
       AND conname = 'cart_items_size_qtys_is_object'
  ) THEN
    ALTER TABLE cart_items
      ADD CONSTRAINT cart_items_size_qtys_is_object
      CHECK (jsonb_typeof(size_qtys) = 'object');
  END IF;
END $$;

ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_profile_id_product_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cart_items'::regclass
       AND conname = 'cart_items_profile_product_color_key'
  ) THEN
    ALTER TABLE cart_items
      ADD CONSTRAINT cart_items_profile_product_color_key
      UNIQUE (profile_id, product_id, selected_color);
  END IF;
END $$;

COMMENT ON COLUMN cart_items.selected_color IS
  'Colourway this line is for. Empty string when the product has no colour variants; part of the uniqueness key so one style can sit in the cart in several colours.';
COMMENT ON COLUMN cart_items.size_qtys IS
  'Flat { size: quantity } map for this product/colour line. Sizes with no quantity are omitted rather than stored as 0.';

-- update_updated_at() is the shared helper from 20260418000013_email_intake.sql.
DROP TRIGGER IF EXISTS cart_items_set_updated_at ON cart_items;
CREATE TRIGGER cart_items_set_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Quantity edits are updates, not inserts. Without this policy the only way to
-- change a line under RLS is delete + re-insert.
DROP POLICY IF EXISTS "Users update own cart" ON cart_items;
CREATE POLICY "Users update own cart"
  ON cart_items FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
