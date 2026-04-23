-- Decrement stock_qty on native variants when their orders transition to 'shipped'.
-- Variants linked to Shopify (shopify_variant_id NOT NULL) are skipped;
-- Shopify's own fulfillment decrements their inventory and the webhook re-mirrors.

CREATE OR REPLACE FUNCTION apply_stock_decrement_on_ship()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'shipped' AND (OLD.status IS DISTINCT FROM 'shipped') THEN
    -- Aggregate first: an order can have multiple lines for the same variant.
    -- A naive join would under-decrement by picking one line's qty non-deterministically.
    UPDATE product_variants pv
    SET stock_qty = GREATEST(0, pv.stock_qty - agg.total_qty)
    FROM (
      SELECT variant_id, SUM(qty) AS total_qty
      FROM order_lines
      WHERE order_id = NEW.id
        AND variant_id IS NOT NULL
      GROUP BY variant_id
    ) agg
    WHERE agg.variant_id = pv.id
      AND pv.shopify_variant_id IS NULL        -- skip mirrored variants
      AND pv.stock_qty IS NOT NULL;             -- only decrement when qty is tracked
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS trg_decrement_stock_on_ship ON orders;
CREATE TRIGGER trg_decrement_stock_on_ship
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION apply_stock_decrement_on_ship();

COMMENT ON FUNCTION apply_stock_decrement_on_ship() IS
  'Native inventory decrement. Fires only on transition into shipped. Skips Shopify-mirrored variants and untracked (NULL qty) variants.';
