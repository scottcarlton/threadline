-- Issue an invoice: numbering and the send transition.
--
-- Spec: Notion > Threadline > Projects > Order Invoicing (SCO-177).
--
-- A draft becomes a real document here. Everything that makes it real --
-- the number, the dates, the frozen money -- happens in one statement so a
-- half-issued invoice cannot exist.

-- ---------------------------------------------------------------------------
-- generate_invoice_number
-- ---------------------------------------------------------------------------
--
-- Copies generate_expense_number() as rewritten in
-- 20260909000002_fix_expense_number_sequencing.sql, including both bugs that
-- migration fixed:
--
--   * The sequence comes from a stored counter, never COUNT(*) + 1. A counter
--     only ever advances, so deleting a draft can never hand the next send a
--     value that is already in use. Drafts are deletable by design, which
--     makes this the difference between working and broken rather than a
--     nicety.
--
--   * Uniqueness is per-organization (see the constraint on `invoices`), so
--     two orgs whose slugs share their first three characters do not collide
--     once their counters reach the same value.
--
-- Unlike the expense and order generators this is NOT a BEFORE INSERT
-- trigger. An invoice is inserted as a draft with no number and numbered only
-- when sent, because `preparing -> cancelled` would otherwise burn a value
-- every time an order died while being packed.

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_organization_id UUID)
RETURNS TEXT AS $$
DECLARE
  org_slug TEXT;
  seq_num INTEGER;
BEGIN
  UPDATE organizations
     SET next_invoice_number = COALESCE(next_invoice_number, 1) + 1
   WHERE id = p_organization_id
  RETURNING slug, COALESCE(next_invoice_number - 1, 1)
    INTO org_slug, seq_num;

  IF org_slug IS NULL THEN
    RAISE EXCEPTION 'Cannot generate an invoice number for unknown organization %', p_organization_id;
  END IF;

  RETURN 'INV-' || UPPER(LEFT(org_slug, 3)) || '-' ||
         LPAD(seq_num::TEXT, GREATEST(5, LENGTH(seq_num::TEXT)), '0');
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.generate_invoice_number(UUID) IS
  'Next per-org invoice number from the stored counter. Called on send, not on insert, so a cancelled draft does not gap the issued sequence.';

-- ---------------------------------------------------------------------------
-- send_invoice
-- ---------------------------------------------------------------------------
--
-- One statement, so there is no window in which an invoice has a number but
-- is still a draft, or is sent but unnumbered.
--
-- `p_due_date` is computed by the caller rather than here. The terms-to-days
-- mapping lives in src/lib/payment-methods.ts (`dueDateFromTerms`), which is
-- also what the UI renders from; re-deriving it in plpgsql would be a second
-- copy of a rule that has to agree with the first. Contrast the tax rule,
-- which lives only in SQL precisely because a rep cannot read the config it
-- depends on. Terms are on the invoice itself, so the app can do this one.
--
-- Money is refreshed, lines are not:
--
--   * `subtotal` is recomputed from `invoice_lines`, not from the order. The
--     brand may have edited the draft's lines for a short-ship, and the
--     document must bill what it lists.
--   * `shipping_amount` is re-read from the order, because freight is usually
--     quoted between `preparing` and send.
--   * `tax_amount` is recomputed by compute_order_tax() against the invoice's
--     own subtotal, so a short-ship is taxed on what actually shipped. That
--     call is why the tax rule stays in one place.
--
-- After this returns, reject_sent_invoice_edits() freezes all of it.
--
-- Not gated on the order being `shipped`. Send is available from `preparing`
-- onward; a brand that invoices on pack has started the terms clock earlier,
-- which is their call to make.

CREATE OR REPLACE FUNCTION public.send_invoice(
  p_invoice_id UUID,
  p_due_date DATE DEFAULT NULL,
  p_issue_date DATE DEFAULT NULL
)
RETURNS invoices AS $$
DECLARE
  v_invoice invoices;
  v_order orders;
  v_subtotal NUMERIC;
  v_shipping NUMERIC;
  v_tax NUMERIC;
  v_total NUMERIC;
  v_number TEXT;
  v_issue DATE;
BEGIN
  -- FOR UPDATE so two concurrent sends cannot both read 'draft' and both
  -- consume a number.
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice % has already been issued (status %)', p_invoice_id, v_invoice.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_invoice.order_id;

  SELECT COALESCE(SUM(line_total), 0) INTO v_subtotal
    FROM invoice_lines
   WHERE invoice_id = p_invoice_id;

  v_shipping := v_order.shipping_cost;

  v_tax := public.compute_order_tax(
    v_invoice.brand_id,
    v_order.location_id,
    v_invoice.account_id,
    v_subtotal
  );

  IF public.brand_pricing_display(v_invoice.brand_id) = 'inclusive' THEN
    v_total := v_subtotal + COALESCE(v_shipping, 0);
  ELSE
    v_total := v_subtotal + COALESCE(v_shipping, 0) + COALESCE(v_tax, 0);
  END IF;

  v_issue := COALESCE(p_issue_date, CURRENT_DATE);
  v_number := public.generate_invoice_number(v_invoice.organization_id);

  UPDATE invoices
     SET invoice_number  = v_number,
         status          = 'sent',
         issue_date      = v_issue,
         due_date        = p_due_date,
         subtotal        = v_subtotal,
         shipping_amount = v_shipping,
         tax_amount      = v_tax,
         total           = v_total,
         sent_at         = NOW()
   WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.send_invoice(UUID, DATE, DATE) IS
  'Issues a draft invoice: assigns the number, stamps the dates, refreshes and freezes the money. Single statement so a half-issued invoice cannot exist. Due date is passed in because the terms mapping lives in src/lib/payment-methods.ts.';

-- The freeze trigger sets status off 'draft' in the same UPDATE it writes the
-- frozen columns in, so OLD.status is still 'draft' when it runs and it does
-- not fire on this path. Asserted in tests/rls/invoice-send.test.ts.
