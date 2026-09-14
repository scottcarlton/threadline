-- Create a draft invoice when the brand starts preparing an order.
--
-- Spec: Notion > Threadline > Projects > Order Invoicing (SCO-176).
--
-- This is the only thing that creates invoices. `invoices` has no INSERT
-- policy at all (20260914000001), so a draft can come from here and nowhere
-- else, which is what makes "a rep cannot issue an invoice" true by
-- construction rather than by a check someone could widen later.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Why `preparing` rather than `shipped`
-- ───────────────────────────────────────────────────────────────────────────
--
-- `preparing` is mandatory on the way to shipped. The transition graph in
-- src/routes/api/orders/[id]/status/+server.ts is
-- `confirmed: ['preparing','cancelled']` and `preparing: ['shipped','cancelled']`,
-- so there is no confirmed -> shipped edge that could skip it.
--
-- Creating here is what gives the draft a reason to exist. It is a work
-- surface the brand uses while packing: short-ships are discovered while
-- picking, which is exactly when the lines need adjusting, and `shipping_cost`
-- is usually unknown until the box is quoted, so a draft with a null shipping
-- amount is the honest representation of that state rather than a broken one.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Why it carries no number
-- ───────────────────────────────────────────────────────────────────────────
--
-- `preparing -> cancelled` is a live edge. Assigning a number at creation
-- would burn a sequence value every time an order dies while being packed and
-- gap the issued series, which is the one thing invoice numbering cannot
-- tolerate. Numbering happens on send (SCO-177). That is also why an unsent
-- draft can be deleted while a sent invoice can only be voided.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Snapshot, not a view
-- ───────────────────────────────────────────────────────────────────────────
--
-- Lines and the bill-to address are copied, not joined. An invoice is a
-- financial document: if someone edits the order or the account's address
-- afterwards, the invoice the buyer already received must not change
-- underneath them.

-- ---------------------------------------------------------------------------
-- brand_pricing_display
-- ---------------------------------------------------------------------------
--
-- The invoice total depends on whether prices already include tax, and that
-- flag lives in two places depending on who owns the brand -- the same split
-- compute_order_tax() and resolve-order-settings.ts both handle. Pulled out
-- here so the total calculation below and the send path in SCO-177 share one
-- answer instead of each re-deriving it.
--
-- SECURITY DEFINER for the same reason as compute_order_tax(): the config
-- belongs to the brand, and a rep-side actor has no SELECT path to it.

CREATE OR REPLACE FUNCTION public.brand_pricing_display(p_brand_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_display TEXT;
BEGIN
  SELECT CASE
           WHEN o.org_type = 'rep' THEN COALESCE(b.taxes_pricing_display, 'exclusive')
           ELSE COALESCE(o.taxes_pricing_display, 'exclusive')
         END
    INTO v_display
    FROM brands b
    JOIN organizations o ON o.id = b.organization_id
   WHERE b.id = p_brand_id;

  RETURN COALESCE(v_display, 'exclusive');
END;
$$ LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.brand_pricing_display(UUID) IS
  'Whether the brand''s prices are tax-exclusive or tax-inclusive, resolved from brands for a rep-owned manual brand and organizations otherwise. SECURITY DEFINER: the config belongs to the brand and a rep has no SELECT path to it.';

-- ---------------------------------------------------------------------------
-- create_invoice_draft_for_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_invoice_draft_for_order()
RETURNS TRIGGER AS $$
DECLARE
  v_bill_to_location UUID;
  v_name TEXT;
  v_line1 TEXT;
  v_line2 TEXT;
  v_city TEXT;
  v_state TEXT;
  v_zip TEXT;
  v_country TEXT;
  v_subtotal NUMERIC;
  v_shipping NUMERIC;
  v_tax NUMERIC;
  v_total NUMERIC;
  v_invoice_id UUID;
BEGIN
  -- One invoice per order. `invoices` is UNIQUE on order_id, so this guard is
  -- belt-and-braces rather than the only defence: it keeps a re-entry into
  -- `preparing` from raising instead of quietly doing nothing. There is no
  -- cancelled -> preparing edge today, so this is defensive against a future
  -- graph change.
  IF EXISTS (SELECT 1 FROM invoices WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Bill-to resolution, in the order the finalize step defines
  -- (20260421000002): the explicit bill-to location, else the ship-to
  -- location ("bill_to_location_id NULL means the UI derives bill-to from
  -- ship-to"), else the account's own address.
  v_bill_to_location := COALESCE(NEW.bill_to_location_id, NEW.location_id);

  IF v_bill_to_location IS NOT NULL THEN
    SELECT al.address_line1, al.address_line2, al.city, al.state, al.zip, al.country
      INTO v_line1, v_line2, v_city, v_state, v_zip, v_country
      FROM account_locations al
     WHERE al.id = v_bill_to_location;
  END IF;

  -- account_id is guaranteed non-null here. The orders_freeform_only_draft
  -- constraint (20260413000003) is
  -- `CHECK (account_id IS NOT NULL OR status = 'draft')`, so a freeform order
  -- cannot leave draft and therefore never reaches `preparing`. There is
  -- deliberately no freeform_name fallback below: it would be unreachable
  -- code implying a case the schema forbids.
  SELECT a.business_name INTO v_name FROM accounts a WHERE a.id = NEW.account_id;

  IF v_line1 IS NULL THEN
    SELECT a.address_line1, a.address_line2, a.city, a.state, a.zip, a.country
      INTO v_line1, v_line2, v_city, v_state, v_zip, v_country
      FROM accounts a
     WHERE a.id = NEW.account_id;
  END IF;

  -- total_amount is merchandise only (see src/lib/utils/order-total.ts), which
  -- is exactly the invoice subtotal.
  v_subtotal := COALESCE(NEW.total_amount, 0);
  v_shipping := NEW.shipping_cost;
  v_tax := NEW.tax_amount;

  -- Under tax-inclusive pricing the tax already sits inside the line prices,
  -- so adding it again would double-charge. Under exclusive it is additional.
  IF public.brand_pricing_display(NEW.brand_id) = 'inclusive' THEN
    v_total := v_subtotal + COALESCE(v_shipping, 0);
  ELSE
    v_total := v_subtotal + COALESCE(v_shipping, 0) + COALESCE(v_tax, 0);
  END IF;

  INSERT INTO invoices (
    organization_id,
    order_id,
    brand_id,
    order_org_id,
    account_id,
    status,
    payment_terms,
    po_number,
    bill_to_name,
    bill_to_line1,
    bill_to_line2,
    bill_to_city,
    bill_to_state,
    bill_to_zip,
    bill_to_country,
    subtotal,
    shipping_amount,
    tax_amount,
    total,
    created_by
  )
  SELECT
    -- The issuing org is the brand's owning org, NOT the order's org. On a
    -- federated order orders.organization_id is the rep that sold it, while
    -- the brand owns the goods and bills for them.
    b.organization_id,
    NEW.id,
    NEW.brand_id,
    NEW.organization_id,
    NEW.account_id,
    'draft',
    NEW.payment_terms,
    NEW.po_number,
    v_name,
    v_line1,
    v_line2,
    v_city,
    v_state,
    v_zip,
    v_country,
    v_subtotal,
    v_shipping,
    v_tax,
    v_total,
    -- NULL under a service-role write, which the column allows.
    auth.uid()
  FROM brands b
  WHERE b.id = NEW.brand_id
  RETURNING id INTO v_invoice_id;

  IF v_invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Snapshot the lines. line_total is GENERATED ALWAYS on both tables, so it
  -- is never listed here; Postgres rejects an explicit value.
  INSERT INTO invoice_lines (
    invoice_id, style_number, description, color, size, qty, unit_price, sort_order
  )
  SELECT
    v_invoice_id, ol.style_number, ol.description, ol.color, ol.size,
    ol.qty, ol.unit_price, ol.sort_order
  FROM order_lines ol
  WHERE ol.order_id = NEW.id
  ORDER BY ol.sort_order, ol.created_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.create_invoice_draft_for_order() IS
  'Creates the one draft invoice for an order when it enters preparing, snapshotting lines and bill-to. The only writer of `invoices`, which has no INSERT policy.';

-- AFTER, because it inserts into other tables rather than mutating NEW. The
-- WHEN clause keeps it off every other status change, so the common path pays
-- nothing for it.
DROP TRIGGER IF EXISTS orders_create_invoice_draft ON orders;
CREATE TRIGGER orders_create_invoice_draft
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'preparing' AND OLD.status IS DISTINCT FROM 'preparing')
  EXECUTE FUNCTION public.create_invoice_draft_for_order();

-- ---------------------------------------------------------------------------
-- Clean up an unsent draft when the order is cancelled
-- ---------------------------------------------------------------------------
--
-- `preparing -> cancelled` is a live edge, and the draft for an order nobody
-- will ship is noise on /invoices. Deleting it is safe precisely because it
-- has no number yet: nothing has been issued, so nothing gaps. A sent invoice
-- is deliberately left alone -- that one is voided, not deleted, and its
-- order being cancelled is exactly the case void exists for.

CREATE OR REPLACE FUNCTION public.discard_draft_invoice_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM invoices
   WHERE order_id = NEW.id
     AND status = 'draft'
     AND invoice_number IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.discard_draft_invoice_on_cancel() IS
  'Removes an unsent draft when its order is cancelled. Safe because a draft holds no invoice number, so nothing gaps. Sent invoices are voided instead.';

DROP TRIGGER IF EXISTS orders_discard_draft_invoice ON orders;
CREATE TRIGGER orders_discard_draft_invoice
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.discard_draft_invoice_on_cancel();
