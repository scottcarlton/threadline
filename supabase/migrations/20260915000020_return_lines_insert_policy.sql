-- Let the brand compose the lines of a return it creates itself.
--
-- 20260915000010 shipped this INSERT policy on `return_lines`:
--
--   WITH CHECK (return_id IN (SELECT r.id FROM return_authorizations r
--                              WHERE r.status = 'requested'))
--
-- which is unsatisfiable for the brand's own path. A brand creating a return
-- creates it at `approved` -- it is the approver, so asking it to approve its
-- own record is theatre, and `initialReturnStatus()` encodes that. The parent
-- therefore never passes through `requested`, and every line insert that
-- follows is refused:
--
--   new row violates row-level security policy for table "return_lines"
--
-- The RA row itself is created fine, so the failure lands *after* the parent
-- exists, leaving a return with no items. Found by driving /returns/new in a
-- browser as a brand admin during SCO-184; no unit or RLS test covered it,
-- because 20260915000010's suite asserted only that the policies refuse the
-- wrong actors, never that they admit the right one.
--
-- The rule this should have expressed all along mirrors the UPDATE policy:
--
--   * an initiator (buyer or rep) may compose the request they are opening,
--     which is `requested` and nothing else;
--   * the brand may compose lines while the return is still open to it, which
--     is `requested` or `approved`, exactly as it may edit them.
--
-- Anything past `approved` stays closed to both: once goods are received the
-- lines describe what physically arrived, and once a credit memo is issued
-- reject_issued_credit_memo_line_edits() freezes them outright.

DROP POLICY IF EXISTS "Initiators can add lines to their own request" ON return_lines;

CREATE POLICY "Initiators can add lines to their own request"
  ON return_lines FOR INSERT
  WITH CHECK (
    -- Buyer or rep composing the request they are opening.
    return_id IN (
      SELECT r.id FROM return_authorizations r
      WHERE r.status = 'requested'
    )
    -- Brand composing a return it is creating or still working.
    OR return_id IN (
      SELECT r.id FROM return_authorizations r
      WHERE r.status IN ('requested', 'approved')
        AND r.brand_id IN (SELECT get_user_brand_ids(r.organization_id))
        AND get_user_role(r.organization_id) IN ('admin', 'owner', 'member')
    )
  );

COMMENT ON POLICY "Initiators can add lines to their own request" ON return_lines IS
  'Buyer/rep may add lines only while the parent is `requested`; the brand may also add them while it is `approved`, since a brand-created return starts there. Mirrors the UPDATE policy.';
