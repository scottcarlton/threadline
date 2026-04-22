-- Decrement stock_qty on native variants when their orders transition to 'shipped'.
-- Variants linked to Shopify (shopify_variant_id NOT NULL) are skipped;
-- Shopify's own fulfillment decrements their inventory and the webhook re-mirrors.

CREATE OR REPLACE FUNCTION apply_stock_decrement_on_ship()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'shipped' AND (OLD.status IS DISTINCT FROM 'shipped') THEN
    UPDATE product_variants pv
    SET stock_qty = GREATEST(0, pv.stock_qty - ol.qty)
    FROM order_lines ol
    WHERE ol.order_id = NEW.id
      AND ol.variant_id = pv.id
      AND pv.shopify_variant_id IS NULL        -- skip mirrored variants
      AND pv.stock_qty IS NOT NULL;             -- only decrement when qty is tracked
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_decrement_stock_on_ship ON orders;
CREATE TRIGGER trg_decrement_stock_on_ship
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION apply_stock_decrement_on_ship();

COMMENT ON FUNCTION apply_stock_decrement_on_ship() IS
  'Native inventory decrement. Fires only on transition into shipped. Skips Shopify-mirrored variants and untracked (NULL qty) variants.';
