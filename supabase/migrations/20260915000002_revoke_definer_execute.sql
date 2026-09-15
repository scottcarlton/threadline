-- Make the invoice SECURITY DEFINER functions actually authorize their callers.
--
-- SCO-189. Introduced by 20260914000002, 20260914000003, 20260914000004 and
-- 20260915000001.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Two separate defects
-- ───────────────────────────────────────────────────────────────────────────
--
-- 1. Postgres grants EXECUTE on a new function to PUBLIC, and none of these
--    revoked it. Combined with SECURITY DEFINER (which bypasses RLS by design)
--    that made them a read and write path for callers with no policy at all,
--    `anon` included:
--
--      * compute_order_tax() returns the rate a brand charges. Varying the
--        ship-to enumerates which states that brand has nexus in and at what
--        rate. A rep has no RLS path to that config precisely because it is not
--        theirs to see.
--      * brand_pricing_display() leaks whether a brand prices tax-inclusive.
--      * generate_invoice_number() INCREMENTS organizations.next_invoice_number,
--        so any caller could silently burn an org's invoice sequence.
--      * send_invoice() issues a draft. Anyone holding an invoice id could
--        publish it.
--      * void_invoice() withdraws an issued invoice.
--
-- 2. void_invoice()'s own guard did not do what it looked like it did:
--
--      IF get_user_role(org) NOT IN ('admin', 'owner') THEN RAISE
--
--    get_user_role() returns NULL for a caller who is not a member of that org,
--    and `NULL NOT IN (...)` is NULL, not true -- so the branch was not taken
--    and the function carried on. It caught a *member with the wrong role*, the
--    narrow case, while letting every non-member through, the broad one. Three-
--    valued logic reading as a check that is not one.
--
-- The fix is both halves. Grants alone would leave the NULL hole for any
-- authenticated user; the guard alone would leave anon able to call in.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Where authorization lives now
-- ───────────────────────────────────────────────────────────────────────────
--
-- send_invoice and void_invoice are called by the app as the signed-in user and
-- authorize themselves against that identity. They keep EXECUTE for
-- `authenticated` and lose it for `anon`.
--
-- The other three are internal. They run from triggers and from other SECURITY
-- DEFINER functions, where the current user is the definer and the EXECUTE
-- check passes regardless, so no client needs to reach them at all.

-- ---------------------------------------------------------------------------
-- 1. Internal helpers: no client may call these.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.compute_order_tax(UUID, UUID, UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.brand_pricing_display(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(UUID)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. send_invoice: authorize the caller.
-- ---------------------------------------------------------------------------
--
-- Issuing a bill is admin/owner/member in the issuing org, matching the
-- `invoices` UPDATE policy and the endpoint's own role set. Sales and guest are
-- excluded, and so is anyone outside the org.
--
-- Written as `IS NULL OR NOT IN` rather than `NOT IN`, which is the whole point
-- of this migration: a non-member gets NULL and must be rejected explicitly.

CREATE OR REPLACE FUNCTION public.send_invoice(
  p_invoice_id UUID,
  p_due_date DATE DEFAULT NULL,
  p_issue_date DATE DEFAULT NULL
)
RETURNS invoices AS $$
DECLARE
  v_invoice invoices;
  v_order orders;
  v_role user_role;
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

  v_role := get_user_role(v_invoice.organization_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'owner', 'member') THEN
    RAISE EXCEPTION 'Only the issuing organization can send an invoice'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice % has already been issued (status %)', p_invoice_id, v_invoice.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_invoice.order_id;

  -- Subtotal comes from the invoice's own lines, not the order: the brand may
  -- have edited the draft for a short-ship and the document must bill what it
  -- lists. Tax then follows that subtotal, so a short-ship is taxed on what
  -- actually shipped. Shipping is re-read from the order because freight is
  -- usually quoted between `preparing` and send.
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
  'Issues a draft invoice: assigns the number, stamps the dates, refreshes and freezes the money. Authorizes the caller as admin/owner/member of the issuing org; a non-member gets NULL from get_user_role and is rejected explicitly.';

-- ---------------------------------------------------------------------------
-- 3. void_invoice: fix the guard.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS invoices AS $$
DECLARE
  v_invoice invoices;
  v_role user_role;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The NULL arm is the fix. Previously `NOT IN` alone let every non-member
  -- through, because NULL NOT IN (...) is NULL rather than true.
  v_role := get_user_role(v_invoice.organization_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only an admin or owner can void an invoice'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A draft was never issued, so there is nothing to withdraw: it is deleted
  -- instead, which is safe precisely because it holds no number.
  IF v_invoice.status = 'draft' THEN
    RAISE EXCEPTION 'A draft invoice is deleted, not voided'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_invoice.status = 'void' THEN
    RETURN v_invoice;
  END IF;

  UPDATE invoices
     SET status = 'void',
         voided_at = NOW(),
         void_reason = NULLIF(BTRIM(COALESCE(p_reason, '')), '')
   WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.void_invoice(UUID, TEXT) IS
  'Withdraws an issued invoice, keeping its number so the sequence stays gapless. Admin/owner of the issuing org only; a non-member gets NULL from get_user_role and is rejected explicitly.';

-- ---------------------------------------------------------------------------
-- 4. Neither of the caller-facing functions is reachable without a login.
-- ---------------------------------------------------------------------------
--
-- CREATE OR REPLACE preserves existing grants, so the PUBLIC default the
-- originals were created with is still attached and has to be removed here.

REVOKE EXECUTE ON FUNCTION public.send_invoice(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_invoice(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.send_invoice(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_invoice(UUID, TEXT) TO authenticated;
