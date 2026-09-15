-- RA numbering.
--
-- A return gets its number when it reaches `approved`, never before. Deferred
-- for the same reason invoice numbering is deferred to send: `requested ->
-- declined` and `requested -> cancelled` are both live edges, and numbering at
-- creation would burn a value every time a request died, gapping the issued
-- series.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Why a trigger rather than an RPC the app calls
-- ───────────────────────────────────────────────────────────────────────────
--
-- Two paths reach `approved` and both must number the row: a brand creating a
-- return outright (SCO-184, which creates at `approved` because the brand is
-- the approver) and a brand approving someone else's request (SCO-186). A
-- trigger covers both without either caller having to remember, and without a
-- SECURITY DEFINER function that would need its own EXECUTE grant now that
-- 20260915000002 revoked the PUBLIC default.
--
-- It is also the only way to make the number a property of the state rather
-- than of the code path. An approved return without a number is a half-state
-- nothing downstream can render.

CREATE OR REPLACE FUNCTION public.generate_ra_number(p_organization_id UUID)
RETURNS TEXT AS $$
DECLARE
  org_slug TEXT;
  seq_num INTEGER;
BEGIN
  -- Stored counter, never COUNT(*) + 1, per the fix in
  -- 20260909000002_fix_expense_number_sequencing.sql: a counter only advances,
  -- so deleting a requested return can never hand the next approval a value
  -- that is already in use. Requested returns are deletable by design, which
  -- makes this the difference between working and broken.
  UPDATE organizations
     SET next_ra_number = COALESCE(next_ra_number, 1) + 1
   WHERE id = p_organization_id
  RETURNING slug, COALESCE(next_ra_number - 1, 1)
    INTO org_slug, seq_num;

  IF org_slug IS NULL THEN
    RAISE EXCEPTION 'Cannot generate an RA number for unknown organization %', p_organization_id;
  END IF;

  -- Per-organization uniqueness, so two orgs whose slugs share their first
  -- three characters do not collide once their counters reach the same value.
  RETURN 'RA-' || UPPER(LEFT(org_slug, 3)) || '-' ||
         LPAD(seq_num::TEXT, GREATEST(5, LENGTH(seq_num::TEXT)), '0');
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.generate_ra_number(UUID) IS
  'Next RA number for an org, from the stored organizations.next_ra_number counter. Called only by assign_ra_number_on_approval().';

REVOKE ALL ON FUNCTION public.generate_ra_number(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.assign_ra_number_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Only on the way in to `approved`, and only once. An RA that already
  -- carries a number keeps it through every later transition, including
  -- cancellation: withdrawing a return must not release its number back, or
  -- the issued series gaps.
  IF NEW.status = 'approved' AND NEW.ra_number IS NULL THEN
    NEW.ra_number := public.generate_ra_number(NEW.organization_id);
    IF NEW.approved_at IS NULL THEN
      NEW.approved_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.assign_ra_number_on_approval() IS
  'BEFORE INSERT/UPDATE on return_authorizations. Numbers the row the first time it reaches `approved`, covering both a brand-created return and a brand approving a request. Never renumbers.';

-- Fires before return_authorizations_freeze_after_credit_memo, which is
-- alphabetically later, so a row numbered here is still seen as unfrozen by
-- that guard on the same statement.
CREATE TRIGGER return_authorizations_assign_ra_number
  BEFORE INSERT OR UPDATE ON return_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.assign_ra_number_on_approval();
