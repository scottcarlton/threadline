-- Payments against an invoice, and voiding one.
--
-- Spec: Notion > Threadline > Projects > Order Invoicing (SCO-179).
--
-- ───────────────────────────────────────────────────────────────────────────
-- amount_paid is derived, never written directly
-- ───────────────────────────────────────────────────────────────────────────
--
-- `invoices.amount_paid` is the sum of its `invoice_payments` rows, maintained
-- by the trigger below. Status follows from that sum. Keeping both derived
-- means they cannot drift from the payment history: there is no sequence of
-- edits that leaves an invoice marked paid with nothing recorded against it,
-- or marked sent with the money already in.
--
-- This is why payments are rows rather than a single editable figure. A
-- deposit followed by a balance is ordinary in wholesale, and the org already
-- carries settings for it (payments_required_deposit_enabled / _percent).
--
-- ───────────────────────────────────────────────────────────────────────────
-- Overpayment is allowed
-- ───────────────────────────────────────────────────────────────────────────
--
-- If the sum exceeds the total the invoice becomes `paid` and the balance goes
-- negative, which the UI shows as a credit. Rejecting the payment would be
-- refusing to record something that actually happened -- buyers do overpay,
-- and an accounting record that cannot represent reality is worse than one
-- showing a negative balance.

CREATE OR REPLACE FUNCTION public.recalc_invoice_amount_paid()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
  v_paid NUMERIC;
  v_invoice invoices;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM invoice_payments
   WHERE invoice_id = v_invoice_id;

  SELECT * INTO v_invoice FROM invoices WHERE id = v_invoice_id;
  IF v_invoice.id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- A draft has not been issued and a void has been withdrawn; neither should
  -- have its status moved by money arriving. The figure is still kept current
  -- so the history stays truthful.
  IF v_invoice.status IN ('draft', 'void') THEN
    UPDATE invoices SET amount_paid = v_paid WHERE id = v_invoice_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE invoices
     SET amount_paid = v_paid,
         status = CASE
                    WHEN v_paid <= 0 THEN 'sent'
                    WHEN v_paid < total THEN 'partial'
                    ELSE 'paid'
                  END,
         -- Stamped when the balance is cleared, cleared again if a payment is
         -- removed and the invoice falls back to owing something. paid_at must
         -- describe the current state, not the first time it was ever true.
         paid_at = CASE WHEN v_paid >= total THEN COALESCE(paid_at, NOW()) ELSE NULL END
   WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.recalc_invoice_amount_paid() IS
  'Keeps invoices.amount_paid and status in step with the invoice_payments rows. Both derived, so neither can drift from the payment history.';

-- AFTER, because it reads the full set of sibling rows including the one being
-- written. Statement-level would miss which invoice changed on a multi-row
-- delete, so this is per row.
DROP TRIGGER IF EXISTS invoice_payments_recalc ON invoice_payments;
CREATE TRIGGER invoice_payments_recalc
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_invoice_amount_paid();

-- ---------------------------------------------------------------------------
-- void_invoice
-- ---------------------------------------------------------------------------
--
-- Void rather than delete. The number is already issued, and deleting the row
-- would punch a gap in the sequence -- the one thing invoice numbering cannot
-- tolerate. A voided invoice keeps its number and stays in the list.
--
-- This is also how an invoice outlives its order: send is available from
-- `preparing` onward, so an order can be cancelled after its invoice went out.
-- discard_draft_invoice_on_cancel() only removes *unsent* drafts; a sent one
-- is left for this.
--
-- SECURITY DEFINER with an explicit role check rather than relying on the
-- table's UPDATE policy, which admits `member`. Voiding is an accounting act
-- and belongs with recording payment at admin/owner. Enforcing it here means
-- the rule holds even if a future endpoint forgets it.

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS invoices AS $$
DECLARE
  v_invoice invoices;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF get_user_role(v_invoice.organization_id) NOT IN ('admin', 'owner') THEN
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
  'Withdraws an issued invoice, keeping its number so the sequence stays gapless. Admin/owner only, checked here rather than left to the UPDATE policy, which admits member.';
