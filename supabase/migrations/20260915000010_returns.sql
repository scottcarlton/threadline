-- Returns: schema and RLS for `return_authorizations` and `return_lines`.
--
-- Spec: docs/superpowers/specs/2026-09-14-returns-design.md (SCO-182).
--
-- This migration creates the tables, the two counters, and their policies.
-- Nothing writes to them yet: creation is SCO-184, the transitions and
-- generate_ra_number() are SCO-186, and the credit memo is SCO-187.
--
-- ───────────────────────────────────────────────────────────────────────────
-- What a return authorization is
-- ───────────────────────────────────────────────────────────────────────────
--
-- The app has had a returns *policy* since 20260425000005_org_returns.sql:
-- organizations carries returns_window_days, returns_policy_text, a return
-- address, a restocking fee, and returns_buyer_pays_shipping, all editable at
-- /organization/returns. Nothing has ever read any of them. These tables are
-- the process that policy describes.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Ownership: the issuing brand org, not the order's org
-- ───────────────────────────────────────────────────────────────────────────
--
-- Identical to `invoices` (20260914000001) and for the same reason. For a
-- federated order `organization_id` here is NOT orders.organization_id, which
-- is always the rep org. The rep sold the order; the brand takes the goods
-- back and issues the credit. A credit is fulfillment state in reverse, and
-- reject_non_brand_fulfillment_status() (20260909000001) already established
-- that fulfillment belongs to the brand.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Why brand_id, order_org_id, and account_id are denormalized
-- ───────────────────────────────────────────────────────────────────────────
--
-- Three actors read a return, each keying off a different column: the brand by
-- brand, the rep by the order's org, the buyer by account. All three are on
-- the row so every SELECT policy is a single-table predicate.
--
-- Subquerying through `orders` is deliberately avoided. A subquery inside an
-- RLS policy is itself subject to the referenced table's RLS, and `orders`
-- carries a dense policy set that has already produced a 42P17 once
-- (20260901000001_fix_orders_update_recursion.sql).

-- ---------------------------------------------------------------------------
-- Counters. Unused until SCO-186 and SCO-187 add their generators.
-- ---------------------------------------------------------------------------
--
-- Stored counters rather than COUNT(*) + 1, per the fix in
-- 20260909000002_fix_expense_number_sequencing.sql: a counter only ever
-- advances, so deleting a row elsewhere can never hand the next issue a value
-- that is already in use. Requested returns are deletable by design, which
-- makes this the difference between working and broken rather than a nicety.

ALTER TABLE organizations
  ADD COLUMN next_ra_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN next_credit_memo_number INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- return_authorizations
-- ---------------------------------------------------------------------------

CREATE TABLE return_authorizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Issuing brand org.
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- NULL means free-entry: a return entered by hand with its own items and no
  -- source order. Deliberately NOT UNIQUE, unlike invoices.order_id. One
  -- delivered order can be returned against more than once, so quantities are
  -- capped at ordered-minus-already-returned in the app layer (SCO-183)
  -- rather than by a one-row-per-order constraint here.
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  -- Denormalized read keys. See header.
  brand_id UUID NOT NULL REFERENCES brands(id),

  -- Nullable, unlike invoices.order_org_id. For a free-entry return raised by
  -- a rep this is the requesting rep org, which is what keeps that rep able to
  -- see their own request. For one raised by the brand it is NULL and no rep
  -- sees it, which is correct because no rep is involved.
  order_org_id UUID REFERENCES organizations(id),

  account_id UUID REFERENCES accounts(id),

  -- NULL until approved. Numbering is deferred for the same reason invoice
  -- numbering is deferred to send: `requested -> declined` and
  -- `requested -> cancelled` are both live edges, and assigning at creation
  -- would burn a sequence value every time a request died, gapping the issued
  -- series. An unapproved request can therefore be deleted freely; an
  -- approved one can only be cancelled.
  ra_number TEXT,

  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'declined', 'received', 'closed', 'cancelled')),

  -- Header-level reason. `reason_code` is validated in the app layer rather
  -- than by a DB CHECK, matching the convention set for invoice_payments.method
  -- in 20260419000002: the vocabulary is product copy and will move.
  reason TEXT,
  reason_code TEXT,

  requested_by UUID REFERENCES profiles(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  decline_reason TEXT,

  received_by UUID REFERENCES profiles(id),
  received_at TIMESTAMPTZ,

  -- Credit memo money. Stored rather than generated: under tax-exclusive
  -- pricing the tax is added, under tax-inclusive it is already inside the
  -- line prices, and which applies depends on the brand's pricing display at
  -- the moment the memo is issued. One expression cannot express both. Same
  -- reasoning as invoices.total.
  credit_subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  restocking_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  shipping_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0,
  credit_tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  credit_total NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- NULL until the memo is issued. Setting it arms the freeze trigger below.
  credit_memo_number TEXT,
  credit_memo_issued_at TIMESTAMPTZ,

  -- The invoice this memo credits, when the return is order-derived and that
  -- order has a sent invoice. NULL on free-entry.
  applied_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Per-org, not global. 20260909000002 had to widen exactly this constraint
  -- on brand_expenses after two orgs whose slugs shared their first three
  -- characters collided on a global UNIQUE.
  CONSTRAINT return_authorizations_ra_number_unique_per_org
    UNIQUE (organization_id, ra_number),
  CONSTRAINT return_authorizations_credit_memo_number_unique_per_org
    UNIQUE (organization_id, credit_memo_number)
);

CREATE INDEX return_authorizations_organization_id_idx ON return_authorizations (organization_id);
CREATE INDEX return_authorizations_brand_id_idx ON return_authorizations (brand_id);
CREATE INDEX return_authorizations_order_org_id_idx ON return_authorizations (order_org_id);
CREATE INDEX return_authorizations_account_id_idx ON return_authorizations (account_id);
CREATE INDEX return_authorizations_order_id_idx ON return_authorizations (order_id);
CREATE INDEX return_authorizations_status_idx ON return_authorizations (status);

COMMENT ON COLUMN return_authorizations.organization_id IS
  'The issuing brand org. For a federated order this differs from orders.organization_id, which is always the rep org.';
COMMENT ON COLUMN return_authorizations.order_id IS
  'NULL for a free-entry return. Deliberately not UNIQUE: one order can be returned against more than once.';
COMMENT ON COLUMN return_authorizations.order_org_id IS
  'Copy of orders.organization_id, or the requesting rep org on a rep-raised free-entry return. NULL when no rep is involved.';
COMMENT ON COLUMN return_authorizations.ra_number IS
  'NULL until approved, so declined and cancelled requests do not gap the issued sequence.';

-- ---------------------------------------------------------------------------
-- return_lines
-- ---------------------------------------------------------------------------
--
-- A snapshot, not a view onto order_lines, for the same reason invoice_lines
-- are: a credit memo is a financial document, and if someone edits the order
-- afterwards the memo the buyer already received must not change underneath
-- them.

CREATE TABLE return_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES return_authorizations(id) ON DELETE CASCADE,

  -- NULL on a free-entry line.
  order_line_id UUID REFERENCES order_lines(id) ON DELETE SET NULL,

  -- Resolved at creation where possible. This is what lets a line restock on
  -- receipt (SCO-186); a free-entry line that never resolves is still valid,
  -- it simply has nothing to increment.
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,

  style_number TEXT,
  description TEXT,
  color TEXT,
  size TEXT,
  qty INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- Generated, exactly as order_lines.line_total and invoice_lines.line_total
  -- are. Postgres rejects any explicit value, including NULL, so never send
  -- this column.
  line_total NUMERIC(12, 2) GENERATED ALWAYS AS (qty * unit_price) STORED,

  reason_code TEXT,

  -- NULL until the goods are received and inspected.
  disposition TEXT CHECK (disposition IS NULL OR disposition IN ('restock', 'damaged', 'destroy')),

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX return_lines_return_id_idx ON return_lines (return_id);
CREATE INDEX return_lines_order_line_id_idx ON return_lines (order_line_id);
CREATE INDEX return_lines_variant_id_idx ON return_lines (variant_id);

COMMENT ON COLUMN return_lines.variant_id IS
  'Drives restock on receipt. NULL on a free-entry line whose style number did not resolve to a variant.';

-- ---------------------------------------------------------------------------
-- Freeze an issued credit memo
-- ---------------------------------------------------------------------------
--
-- UPDATE is granted per row, not per column, so the policies below cannot say
-- "only status may move after the memo is issued". A trigger can, and it needs
-- OLD to do it, which rules out a WITH CHECK. Same shape and same reasoning as
-- reject_sent_invoice_edits() in 20260914000001 and
-- reject_non_brand_fulfillment_status() in 20260909000001.
--
-- Like those triggers this fires ahead of RLS, so it also constrains
-- service-role writes. SCO-187's issue path is the one legitimate caller that
-- sets credit_memo_number and the money columns, and it does so in the same
-- statement -- OLD.credit_memo_number is still NULL at that point, so the
-- guard does not fire on it.

CREATE OR REPLACE FUNCTION public.reject_issued_credit_memo_edits()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.credit_memo_number IS NOT NULL AND (
       NEW.credit_memo_number   IS DISTINCT FROM OLD.credit_memo_number
    OR NEW.credit_memo_issued_at IS DISTINCT FROM OLD.credit_memo_issued_at
    OR NEW.ra_number            IS DISTINCT FROM OLD.ra_number
    OR NEW.order_id             IS DISTINCT FROM OLD.order_id
    OR NEW.organization_id      IS DISTINCT FROM OLD.organization_id
    OR NEW.brand_id             IS DISTINCT FROM OLD.brand_id
    OR NEW.order_org_id         IS DISTINCT FROM OLD.order_org_id
    OR NEW.account_id           IS DISTINCT FROM OLD.account_id
    OR NEW.applied_invoice_id   IS DISTINCT FROM OLD.applied_invoice_id
    OR NEW.credit_subtotal      IS DISTINCT FROM OLD.credit_subtotal
    OR NEW.restocking_fee       IS DISTINCT FROM OLD.restocking_fee
    OR NEW.shipping_deduction   IS DISTINCT FROM OLD.shipping_deduction
    OR NEW.credit_tax           IS DISTINCT FROM OLD.credit_tax
    OR NEW.credit_total         IS DISTINCT FROM OLD.credit_total
  ) THEN
    RAISE EXCEPTION 'Return % has an issued credit memo; its money columns and keys are frozen (attempted edit to a frozen column)', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.reject_issued_credit_memo_edits() IS
  'BEFORE UPDATE on return_authorizations. Once credit_memo_number is set, freezes the money columns, the denormalized read keys, and both numbers. Fires ahead of RLS, so it also covers service-role writes.';

CREATE TRIGGER return_authorizations_freeze_after_credit_memo
  BEFORE UPDATE ON return_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.reject_issued_credit_memo_edits();

-- Keep updated_at honest. update_updated_at() is the existing shared helper.
CREATE TRIGGER return_authorizations_set_updated_at
  BEFORE UPDATE ON return_authorizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Lines of an issued memo are frozen too
-- ---------------------------------------------------------------------------
--
-- The RLS write policies below already stop a line changing once the parent
-- leaves `approved`, but RLS does not bind the service role, and every
-- transition endpoint in this feature uses supabaseAdmin. This trigger is the
-- half that does, mirroring how the parent's freeze covers service-role writes.
--
-- INSERT and UPDATE only. DELETE is deliberately NOT guarded here, and the
-- reason is not stylistic: `return_lines.return_id` is ON DELETE CASCADE, and a
-- cascade fires this row trigger with the parent still visible to the
-- statement's snapshot. Guarding DELETE therefore made any return carrying an
-- issued credit memo permanently undeletable, which in turn made its
-- organization undeletable, since organizations cascade all the way down. That
-- was verified against the local database, not reasoned about: the cascade
-- raised `insufficient_privilege` from this function.
--
-- Deleting a line of an issued memo directly is still refused by the RLS DELETE
-- policy below, which requires the parent to be `requested` or `approved`. What
-- is given up is only the service-role case, and an un-deletable org is far
-- worse than that narrow gap.

CREATE OR REPLACE FUNCTION public.reject_issued_credit_memo_line_edits()
RETURNS TRIGGER AS $$
DECLARE
  memo TEXT;
BEGIN
  SELECT credit_memo_number INTO memo
    FROM public.return_authorizations
   WHERE id = NEW.return_id;

  IF memo IS NOT NULL THEN
    RAISE EXCEPTION 'Return % has an issued credit memo; its lines are frozen', NEW.return_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.reject_issued_credit_memo_line_edits() IS
  'BEFORE INSERT/UPDATE on return_lines. Rejects a write once the parent return has an issued credit memo. Fires ahead of RLS, so it also covers service-role writes. Deliberately excludes DELETE so the parent cascade is not blocked.';

CREATE TRIGGER return_lines_freeze_after_credit_memo
  BEFORE INSERT OR UPDATE ON return_lines
  FOR EACH ROW EXECUTE FUNCTION public.reject_issued_credit_memo_line_edits();

-- ---------------------------------------------------------------------------
-- RLS: return_authorizations
-- ---------------------------------------------------------------------------

ALTER TABLE return_authorizations ENABLE ROW LEVEL SECURITY;

-- Brand side. Brand-scoped rather than plain is_org_member, matching
-- `invoices` and `brand_expenses`: a member or guest restricted to one brand
-- via member_brand_access must not see another brand's returns.
CREATE POLICY "Returns visible to the issuing brand org"
  ON return_authorizations FOR SELECT
  USING (brand_id IN (SELECT get_user_brand_ids(organization_id)));

-- Rep side. The rep sold the order, so a return against it moves their
-- commission basis.
--
-- Unlike the `invoices` rep arm there is no status gate. An invoice hides its
-- draft because a draft is the brand's private working document; a return at
-- `requested` is the opposite -- it is a request addressed to the brand, and
-- the rep servicing the account is exactly who needs to see it pending.
--
-- `order_org_id <> organization_id` IS carried over, and it is load-bearing.
-- Policies are OR'd, so without it this arm matches for a brand-internal order
-- (whose order org IS the issuing org) and hands every member of the brand org
-- a row the brand-scoped arm above deliberately withheld, defeating
-- member_brand_access. Same shape as the brand_expenses federation arm, the
-- same guard 20260914000001 carries on invoices, and the same class of bug
-- 20260910000002_orders_update_brand_scope.sql fixed on orders.
--
-- It also does the right thing for a rep-raised free-entry return: the issuing
-- org is the brand, order_org_id is the rep, so the arm still matches.
CREATE POLICY "Returns visible to the order's org"
  ON return_authorizations FOR SELECT
  USING (
    order_org_id IN (SELECT get_user_org_ids())
    AND order_org_id <> organization_id
  );

-- Buyer side, via the buyer-portal helper.
CREATE POLICY "Returns visible to the buyer"
  ON return_authorizations FOR SELECT
  USING (account_id IN (SELECT get_buyer_account_ids()));

-- INSERT, three arms.
--
-- Unlike `invoices`, which has no INSERT policy at all because exactly one
-- trigger creates it, a return has three legitimate initiators with different
-- rules. Each arm pins the status the initiator may create at, which is what
-- makes "a rep cannot approve its own return" true at the row level rather
-- than only in the endpoint.
--
-- These arms constrain the keys the initiator could otherwise forge. They do
-- not fully validate that `order_id` belongs to the claimed org, because that
-- would mean subquerying `orders` inside a policy -- see the header. That
-- check is Layer 4, in the create endpoint (SCO-184), which derives the
-- denormalized keys server-side from the order rather than trusting the
-- client. Note the exposure is integrity, not disclosure: the keys a writer
-- sets decide who may READ the row, so a forged key cannot reveal anything to
-- the writer.

-- A buyer may only ever open a request, never an approved return, and only
-- against an account they belong to and a brand that account can actually buy
-- from.
CREATE POLICY "Buyers can request a return"
  ON return_authorizations FOR INSERT
  WITH CHECK (
    status = 'requested'
    AND account_id IN (SELECT get_buyer_account_ids())
    AND brand_id IN (SELECT get_buyer_brand_ids())
  );

-- A rep may only open a request, attributed to one of their own orgs.
CREATE POLICY "Reps can request a return"
  ON return_authorizations FOR INSERT
  WITH CHECK (
    status = 'requested'
    AND order_org_id IN (SELECT get_user_org_ids())
    AND order_org_id <> organization_id
  );

-- The brand may create at `approved` as well, because it is the approver; a
-- brand approving its own record would be theatre. Sales and guest are
-- excluded: taking goods back and crediting for them is not a sales action,
-- the same line `invoices` draws.
CREATE POLICY "Brand can create a return"
  ON return_authorizations FOR INSERT
  WITH CHECK (
    status IN ('requested', 'approved')
    AND brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member')
  );

-- UPDATE is the brand's alone, in both USING and WITH CHECK per the lesson in
-- 20260910000002: a user may only edit what they can read, and may not move a
-- row to a brand they cannot read.
--
-- There is deliberately no rep or buyer UPDATE arm. This single policy is what
-- enforces the whole ownership rule for this feature: approve, decline,
-- receive, and issue are all UPDATEs, so withholding UPDATE from reps and
-- buyers makes "only the brand can approve, receive, and credit" true by
-- construction. It mirrors reject_non_brand_fulfillment_status() on orders.
CREATE POLICY "Brand can update returns"
  ON return_authorizations FOR UPDATE
  USING (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member')
  )
  WITH CHECK (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member')
  );

-- Requested only. Once approved the row carries a number and must survive as a
-- cancellation, or the sequence gaps. Same rule as draft-only invoice deletes.
CREATE POLICY "Admin/owner can delete requested returns"
  ON return_authorizations FOR DELETE
  USING (
    status = 'requested'
    AND brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner')
  );

-- ---------------------------------------------------------------------------
-- RLS: return_lines
-- ---------------------------------------------------------------------------
--
-- Visibility is inherited: the subquery on return_authorizations is itself
-- subject to the policies above, so "lines of returns you can see" falls out
-- without restating the arms. The dependency runs one way only -- no policy on
-- return_authorizations references return_lines -- so there is no recursion
-- risk.

ALTER TABLE return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Return lines follow return visibility"
  ON return_lines FOR SELECT
  USING (return_id IN (SELECT id FROM return_authorizations));

-- Writes while the parent is still open.
--
-- `approved` is included, not just `requested`, because receipt writes
-- `disposition` onto each line: the receive path sets dispositions and then
-- moves the parent to `received` in the same transaction, so the parent is
-- still `approved` when the lines are written.
--
-- The buyer and rep arms are INSERT-only and requested-only: an initiator
-- composes the lines of the request they are opening, and after that the
-- return is the brand's to work.
CREATE POLICY "Initiators can add lines to their own request"
  ON return_lines FOR INSERT
  WITH CHECK (
    return_id IN (
      SELECT r.id FROM return_authorizations r
      WHERE r.status = 'requested'
    )
  );

CREATE POLICY "Brand can update lines on an open return"
  ON return_lines FOR UPDATE
  USING (
    return_id IN (
      SELECT r.id FROM return_authorizations r
      WHERE r.status IN ('requested', 'approved')
        AND r.brand_id IN (SELECT get_user_brand_ids(r.organization_id))
        AND get_user_role(r.organization_id) IN ('admin', 'owner', 'member')
    )
  )
  WITH CHECK (
    return_id IN (
      SELECT r.id FROM return_authorizations r
      WHERE r.status IN ('requested', 'approved')
        AND r.brand_id IN (SELECT get_user_brand_ids(r.organization_id))
        AND get_user_role(r.organization_id) IN ('admin', 'owner', 'member')
    )
  );

CREATE POLICY "Brand can delete lines on an open return"
  ON return_lines FOR DELETE
  USING (
    return_id IN (
      SELECT r.id FROM return_authorizations r
      WHERE r.status IN ('requested', 'approved')
        AND r.brand_id IN (SELECT get_user_brand_ids(r.organization_id))
        AND get_user_role(r.organization_id) IN ('admin', 'owner', 'member')
    )
  );
