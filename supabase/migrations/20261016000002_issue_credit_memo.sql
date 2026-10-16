-- Issuing a credit memo: number it, freeze the money, close the return.
--
-- SCO-187. Spec: docs/superpowers/specs/2026-09-14-returns-design.md.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Why one function
-- ───────────────────────────────────────────────────────────────────────────
--
-- The number and the money have to land together. Taking a number in one call
-- and writing the memo in another leaves a gap in the issued series whenever
-- the second call fails, and a gap in credit memo numbers is exactly what an
-- accountant asks about. Same reasoning as send_invoice() (20260914000004).
--
-- It is also the write that arms reject_issued_credit_memo_edits()
-- (20260915000010): credit_memo_number and the money columns are set in the
-- same statement, while OLD.credit_memo_number is still NULL, so the freeze
-- lets this one write through and refuses every later one.
--
-- ───────────────────────────────────────────────────────────────────────────
-- What the caller decides, and what it does not
-- ───────────────────────────────────────────────────────────────────────────
--
-- The caller passes the three amounts the brand may override: restocking fee,
-- shipping deduction, tax. A goodwill waiver is routine in wholesale, and a
-- policy that cannot be waived gets waived outside the system.
--
-- Everything else is derived here, so no caller can state a subtotal that is
-- not the sum of the lines, or a total that does not follow from the parts:
--
--   credit_subtotal    = Σ return_lines.line_total
--   applied_invoice_id = the order's issued invoice, if the return has an order
--                        and that order has one (sent, partial or paid)
--   credit_total       = subtotal − fee − shipping (+ tax unless inclusive),
--                        floored at zero
--
-- Tax is added under exclusive pricing and not under inclusive, mirroring
-- send_invoice(). Inclusive applies only when there is a source invoice: that
-- is when the line prices are known to be the ones the tax was inside. This is
-- the same rule as returnCreditTotal() in src/lib/utils/return-credit-total.ts,
-- which the preview uses; tests/rls/credit-memo.test.ts holds the two together.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Authorization
-- ───────────────────────────────────────────────────────────────────────────
--
-- Brand only, admin/owner/member of the issuing org, the same set that may
-- receive. The NULL arm is explicit: get_user_role() is NULL for a non-member,
-- and `NULL NOT IN (...)` is NULL, which is the SCO-189 hole.

-- ── Numbering ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_credit_memo_number(p_organization_id UUID)
RETURNS TEXT AS $$
DECLARE
  org_slug TEXT;
  seq_num INTEGER;
BEGIN
  -- Stored counter, never COUNT(*) + 1 (20260909000002). It only advances, so
  -- nothing deleted elsewhere can hand the next memo a number already issued.
  UPDATE organizations
     SET next_credit_memo_number = COALESCE(next_credit_memo_number, 1) + 1
   WHERE id = p_organization_id
  RETURNING slug, COALESCE(next_credit_memo_number - 1, 1)
    INTO org_slug, seq_num;

  IF org_slug IS NULL THEN
    RAISE EXCEPTION 'Cannot generate a credit memo number for unknown organization %', p_organization_id;
  END IF;

  RETURN 'CM-' || UPPER(LEFT(org_slug, 3)) || '-' ||
         LPAD(seq_num::TEXT, GREATEST(5, LENGTH(seq_num::TEXT)), '0');
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.generate_credit_memo_number(UUID) IS
  'Next credit memo number for an org, from organizations.next_credit_memo_number. Called only by issue_credit_memo().';

-- Increments a counter with no caller check, so no client may call it. Named
-- roles, not just PUBLIC: Supabase grants new functions to anon and
-- authenticated directly (SCO-191).
REVOKE ALL ON FUNCTION public.generate_credit_memo_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_credit_memo_number(UUID) TO service_role;

-- ── Issue ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_credit_memo(
  p_return_id UUID,
  p_restocking_fee NUMERIC,
  p_shipping_deduction NUMERIC,
  p_credit_tax NUMERIC
)
RETURNS return_authorizations AS $$
DECLARE
  v_return return_authorizations;
  v_role user_role;
  v_subtotal NUMERIC;
  v_invoice_id UUID;
  v_inclusive BOOLEAN := false;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_return FROM return_authorizations WHERE id = p_return_id FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return % not found', p_return_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_role := get_user_role(v_return.organization_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'owner', 'member') THEN
    RAISE EXCEPTION 'Only the issuing brand can issue a credit memo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_return.credit_memo_number IS NOT NULL THEN
    RAISE EXCEPTION 'Return % already has credit memo %', p_return_id, v_return.credit_memo_number
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_return.status <> 'received' THEN
    RAISE EXCEPTION 'A credit memo is issued once the goods are received (return % is %)',
      p_return_id, v_return.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_restocking_fee IS NULL OR p_shipping_deduction IS NULL OR p_credit_tax IS NULL
     OR p_restocking_fee < 0 OR p_shipping_deduction < 0 OR p_credit_tax < 0 THEN
    RAISE EXCEPTION 'Restocking fee, shipping deduction and tax must each be zero or more'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT COALESCE(SUM(line_total), 0) INTO v_subtotal
    FROM return_lines
   WHERE return_id = p_return_id;

  IF v_return.order_id IS NOT NULL THEN
    SELECT id INTO v_invoice_id
      FROM invoices
     WHERE order_id = v_return.order_id
       AND status IN ('sent', 'partial', 'paid');
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    v_inclusive := public.brand_pricing_display(v_return.brand_id) = 'inclusive';
  END IF;

  v_total := v_subtotal - ROUND(p_restocking_fee, 2) - ROUND(p_shipping_deduction, 2);
  IF NOT v_inclusive THEN
    v_total := v_total + ROUND(p_credit_tax, 2);
  END IF;

  UPDATE return_authorizations
     SET credit_subtotal       = v_subtotal,
         restocking_fee        = ROUND(p_restocking_fee, 2),
         shipping_deduction    = ROUND(p_shipping_deduction, 2),
         credit_tax            = ROUND(p_credit_tax, 2),
         -- Floored at zero: deductions larger than the goods mean the brand
         -- owes nothing, not that the buyer owes the brand.
         credit_total          = GREATEST(ROUND(v_total, 2), 0),
         applied_invoice_id    = v_invoice_id,
         credit_memo_number    = public.generate_credit_memo_number(v_return.organization_id),
         credit_memo_issued_at = NOW(),
         status                = 'closed'
   WHERE id = p_return_id
  RETURNING * INTO v_return;

  RETURN v_return;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.issue_credit_memo(UUID, NUMERIC, NUMERIC, NUMERIC) IS
  'Issues the credit memo on a received return: derives the subtotal, applied invoice and total, numbers it from the stored counter, freezes it, and closes the return. Brand-only (admin/owner/member of the issuing org), NULL arm explicit.';

REVOKE ALL ON FUNCTION public.issue_credit_memo(UUID, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_credit_memo(UUID, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
