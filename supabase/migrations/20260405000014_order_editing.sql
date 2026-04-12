-- Track line item changes
ALTER TABLE order_lines ADD COLUMN original_qty INTEGER;
ALTER TABLE order_lines ADD COLUMN removed_at TIMESTAMPTZ;
ALTER TABLE order_lines ADD COLUMN removed_reason TEXT;

-- Track cancel reason on orders
ALTER TABLE orders ADD COLUMN cancelled_reason TEXT;

-- Update the order total trigger to exclude removed lines
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.orders
  SET total_amount = (
    SELECT COALESCE(SUM(line_total), 0)
    FROM public.order_lines
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
      AND removed_at IS NULL
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
