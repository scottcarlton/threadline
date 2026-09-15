-- Invoicing: schema and RLS for `invoices`, `invoice_lines`, `invoice_payments`.
--
-- Spec: Notion > Threadline > Projects > Order Invoicing (SCO-174).
--
-- This migration creates the tables and their policies only. Nothing writes to
-- them yet: the trigger that creates a draft when an order enters `preparing`
-- is SCO-176, and `generate_invoice_number()` is SCO-177. That split is why
-- `invoices` has no INSERT policy at all (see below) and why
-- `next_invoice_number` is added here but never read.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Ownership: the issuing brand org, not the order's org
-- ───────────────────────────────────────────────────────────────────────────
--
-- `invoices.organization_id` is the brand org that issues the document. For a
-- federated order that is NOT `orders.organization_id`, which is always the rep
-- org (see reject_non_brand_fulfillment_status() in 20260909000001 for the same
-- observation). The rep sold the order; the brand owns the goods and bills for
-- them.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Why brand_id, order_org_id, and account_id are denormalized
-- ───────────────────────────────────────────────────────────────────────────
--
-- Three different actors read an invoice, and each keys off a different column:
-- the brand by brand, the rep by the order's org, the buyer by account. All
-- three are copied onto the row at creation so every SELECT policy is a
-- single-table predicate.
--
-- The alternative -- subquerying through `orders` -- is deliberately avoided. A
-- subquery inside an RLS policy is itself subject to the referenced table's
-- RLS, and `orders` carries a dense policy set that has already produced a
-- 42P17 once (20260901000001_fix_orders_update_recursion.sql). Copying three
-- uuids is cheaper than reasoning about that interaction on every read.
--
-- These columns are snapshots, not live mirrors. `reject_sent_invoice_edits()`
-- freezes them once the invoice is sent.
--
-- ───────────────────────────────────────────────────────────────────────────
-- The governing visibility rule: a draft is brand-internal
-- ───────────────────────────────────────────────────────────────────────────
--
-- A draft invoice is the brand's working document. It exists while they are
-- packing, its shipping cost is usually still null, and its lines may be about
-- to change for a short-ship. Neither the rep nor the buyer sees it until the
-- brand sends it. Both federation arms below carry `status <> 'draft'`.

-- ---------------------------------------------------------------------------
-- Counter column. Unused until SCO-177 adds generate_invoice_number().
-- ---------------------------------------------------------------------------
--
-- Stored counter rather than COUNT(*) + 1, per the fix in
-- 20260909000002_fix_expense_number_sequencing.sql: a counter only ever
-- advances, so deleting a row elsewhere can never make the next value collide
-- with a live one.

ALTER TABLE organizations
  ADD COLUMN next_invoice_number INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Issuing brand org.
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- One invoice per order. Orders ship whole today (a single status
  -- transition, one tracking number, one shipping_cost), so there is nothing
  -- to invoice partially. If partial shipments ever land, this constraint
  -- drops and a shipment reference is added; the rest of the table is
  -- unaffected.
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,

  -- Denormalized read keys. See header.
  brand_id UUID NOT NULL REFERENCES brands(id),
  order_org_id UUID NOT NULL REFERENCES organizations(id),
  account_id UUID REFERENCES accounts(id),

  -- NULL until sent. Numbering is deferred to send precisely because
  -- `preparing -> cancelled` is a live edge in the order status graph
  -- (src/routes/api/orders/[id]/status/+server.ts): assigning at creation
  -- would burn a sequence value every time an order dies while being packed,
  -- and gap the issued series. An unsent draft can therefore be deleted
  -- freely; a sent invoice can only be voided.
  invoice_number TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'void')),

  -- Both NULL until sent. due_date is derived from payment_terms at that
  -- point; `other` terms yield no due date rather than a guessed one.
  issue_date DATE,
  due_date DATE,

  -- Snapshotted from the order. An invoice is a financial document: if
  -- someone edits the order or the account's address afterwards, the invoice
  -- the buyer already received must not change underneath them. Same reason
  -- bill_to is columns here rather than a FK to account_locations.
  payment_terms TEXT,
  po_number TEXT,
  bill_to_name TEXT,
  bill_to_line1 TEXT,
  bill_to_line2 TEXT,
  bill_to_city TEXT,
  bill_to_state TEXT,
  bill_to_zip TEXT,
  bill_to_country TEXT,

  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  shipping_amount NUMERIC(12, 2),
  tax_amount NUMERIC(12, 2),

  -- Stored, not generated. Under tax-exclusive pricing total is
  -- subtotal + shipping + tax, but under tax-inclusive pricing the tax is
  -- already inside the line prices and total is subtotal + shipping. One
  -- expression cannot express both, and which applies depends on the org's
  -- taxes_pricing_display at the moment of send.
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Maintained by the rollup trigger in SCO-179, never written directly.
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Which system applied, at what rate, on what basis. Frozen at send so a
  -- later change to the org's rates cannot restate an issued invoice.
  tax_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,

  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Per-org, not global. 20260909000002 had to widen exactly this constraint
  -- on brand_expenses after two orgs whose slugs shared their first three
  -- characters collided on a global UNIQUE.
  CONSTRAINT invoices_number_unique_per_org UNIQUE (organization_id, invoice_number)
);

CREATE INDEX invoices_organization_id_idx ON invoices (organization_id);
CREATE INDEX invoices_brand_id_idx ON invoices (brand_id);
CREATE INDEX invoices_order_org_id_idx ON invoices (order_org_id);
CREATE INDEX invoices_account_id_idx ON invoices (account_id);
CREATE INDEX invoices_status_idx ON invoices (status);

COMMENT ON COLUMN invoices.organization_id IS
  'The issuing brand org. For a federated order this differs from orders.organization_id, which is always the rep org.';
COMMENT ON COLUMN invoices.order_org_id IS
  'Copy of orders.organization_id, so the rep-side SELECT policy is a single-table predicate rather than a subquery through orders.';
COMMENT ON COLUMN invoices.invoice_number IS
  'NULL until sent. Assigned from organizations.next_invoice_number by generate_invoice_number() so cancelled drafts do not gap the issued sequence.';

-- ---------------------------------------------------------------------------
-- invoice_lines
-- ---------------------------------------------------------------------------
--
-- A snapshot of order_lines taken when the draft is created, not a view onto
-- them. See the bill_to note above for why.

CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  style_number TEXT,
  description TEXT,
  color TEXT,
  size TEXT,
  qty INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  -- Generated, exactly as order_lines.line_total is. Postgres rejects any
  -- explicit value, including NULL, so never send this column.
  line_total NUMERIC(12, 2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX invoice_lines_invoice_id_idx ON invoice_lines (invoice_id);

-- ---------------------------------------------------------------------------
-- invoice_payments
-- ---------------------------------------------------------------------------
--
-- Rows, not a single amount_paid field. A deposit followed by a balance is
-- ordinary in wholesale, and the org already has settings for it
-- (payments_required_deposit_enabled / _percent, 20260425000006). Keeping
-- each payment as a row preserves method, reference, and date, and lets
-- invoices.amount_paid be a derived sum that cannot drift from its history.
--
-- `method` is validated in the app layer against PAYMENT_METHODS in
-- src/lib/payment-methods.ts and the org's accepted_payment_methods. No
-- DB-level CHECK or FK, matching the convention set in 20260419000002.

CREATE TABLE invoice_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  -- Denormalized from the parent so the write policies below do not have to
  -- join back through invoices on every INSERT.
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL,
  method TEXT,
  reference TEXT,
  note TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX invoice_payments_invoice_id_idx ON invoice_payments (invoice_id);
CREATE INDEX invoice_payments_organization_id_idx ON invoice_payments (organization_id);

-- ---------------------------------------------------------------------------
-- Freeze a sent invoice
-- ---------------------------------------------------------------------------
--
-- UPDATE is granted per row, not per column, so the policy below cannot say
-- "only status and payment fields may move after send". A trigger can, and it
-- needs OLD to do it, which rules out a WITH CHECK. Same shape and same
-- reasoning as reject_non_brand_fulfillment_status() in 20260909000001.
--
-- Like that trigger this fires ahead of RLS, so it also constrains
-- service-role writes. SCO-177's send path is the one legitimate caller that
-- sets invoice_number, the dates, and the frozen money columns, and it does so
-- in the same statement that moves status off 'draft' -- OLD.status is still
-- 'draft' at that point, so the guard does not fire on it.

CREATE OR REPLACE FUNCTION public.reject_sent_invoice_edits()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
       NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
    OR NEW.order_id       IS DISTINCT FROM OLD.order_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.brand_id       IS DISTINCT FROM OLD.brand_id
    OR NEW.order_org_id   IS DISTINCT FROM OLD.order_org_id
    OR NEW.account_id     IS DISTINCT FROM OLD.account_id
    OR NEW.issue_date     IS DISTINCT FROM OLD.issue_date
    OR NEW.due_date       IS DISTINCT FROM OLD.due_date
    OR NEW.payment_terms  IS DISTINCT FROM OLD.payment_terms
    OR NEW.po_number      IS DISTINCT FROM OLD.po_number
    OR NEW.bill_to_name   IS DISTINCT FROM OLD.bill_to_name
    OR NEW.bill_to_line1  IS DISTINCT FROM OLD.bill_to_line1
    OR NEW.bill_to_line2  IS DISTINCT FROM OLD.bill_to_line2
    OR NEW.bill_to_city   IS DISTINCT FROM OLD.bill_to_city
    OR NEW.bill_to_state  IS DISTINCT FROM OLD.bill_to_state
    OR NEW.bill_to_zip    IS DISTINCT FROM OLD.bill_to_zip
    OR NEW.bill_to_country IS DISTINCT FROM OLD.bill_to_country
    OR NEW.subtotal       IS DISTINCT FROM OLD.subtotal
    OR NEW.shipping_amount IS DISTINCT FROM OLD.shipping_amount
    OR NEW.tax_amount     IS DISTINCT FROM OLD.tax_amount
    OR NEW.total          IS DISTINCT FROM OLD.total
    OR NEW.tax_breakdown  IS DISTINCT FROM OLD.tax_breakdown
  ) THEN
    RAISE EXCEPTION 'Invoice % is already issued; only status and payment fields may change (attempted edit to a frozen column)', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.reject_sent_invoice_edits() IS
  'Freezes the document half of an invoice once status leaves draft. Needs OLD, so it is a trigger rather than a WITH CHECK. Fires before RLS, so it also covers service-role writes.';

CREATE TRIGGER invoices_freeze_after_send
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.reject_sent_invoice_edits();

-- Keep updated_at honest. update_updated_at() is the existing shared helper
-- (defined in 20260418000013_email_intake.sql); it is generic and simply
-- stamps NEW.updated_at.
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: invoices
-- ---------------------------------------------------------------------------

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Brand side. Brand-scoped rather than plain is_org_member, matching
-- brand_expenses: a member or guest restricted to one brand via
-- member_brand_access must not see another brand's billing.
CREATE POLICY "Invoices visible to the issuing brand org"
  ON invoices FOR SELECT
  USING (brand_id IN (SELECT get_user_brand_ids(organization_id)));

-- Rep side. The rep sold the order, so it is their commission basis. Scoped
-- by the order's org rather than by a connection lookup, which also means a
-- rep org that owns the brand row locally sees its own orders' invoices
-- without a special case. Drafts are excluded; see header.
--
-- `order_org_id <> organization_id` is load-bearing, not a tidy-up. Policies
-- are OR'd, so without it this arm matches for a brand-internal order (whose
-- order org IS the issuing org) and hands every member of the brand org a row
-- the brand-scoped arm above deliberately withheld -- defeating
-- member_brand_access. Restricting the arm to genuinely cross-org orders keeps
-- brand-internal invoices governed solely by the brand-scoped policy.
--
-- Caught by tests/rls/invoices.test.ts. It is the same shape as the
-- brand_expenses federation policy ("... AND organization_id NOT the caller's
-- org"), and the same class of bug 20260910000002_orders_update_brand_scope.sql
-- fixed on orders.
CREATE POLICY "Sent invoices visible to the order's org"
  ON invoices FOR SELECT
  USING (
    order_org_id IN (SELECT get_user_org_ids())
    AND order_org_id <> organization_id
    AND status <> 'draft'
  );

-- Buyer side, via the buyer-portal helper. Drafts excluded.
CREATE POLICY "Sent invoices visible to the buyer"
  ON invoices FOR SELECT
  USING (
    account_id IN (SELECT get_buyer_account_ids())
    AND status <> 'draft'
  );

-- No INSERT policy, deliberately.
--
-- Invoices are created by exactly one thing: the SECURITY DEFINER trigger in
-- SCO-176, which fires when the brand moves an order to `preparing`. Granting
-- no role the ability to INSERT is the strongest available statement of that,
-- and it makes "a rep cannot create an invoice" true by construction rather
-- than by a check someone could later widen.

-- UPDATE carries the same brand scope as SELECT, in both USING and WITH CHECK.
-- 20260910000002_orders_update_brand_scope.sql landed days ago for precisely
-- the inverse mistake on `orders`: a role-only USING let a sales user edit
-- rows they could not read, and an absent WITH CHECK let them move a row to a
-- brand they could not read either. Sales and guest are excluded here; issuing
-- and voiding a bill is not a sales action.
CREATE POLICY "Admin/owner/member can update invoices"
  ON invoices FOR UPDATE
  USING (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member')
  )
  WITH CHECK (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member')
  );

-- Drafts only. Once a number is issued the row must survive as a void, or the
-- sequence gaps. This is the DB half of that rule; the void path is SCO-179.
CREATE POLICY "Admin/owner can delete draft invoices"
  ON invoices FOR DELETE
  USING (
    status = 'draft'
    AND brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner')
  );

-- ---------------------------------------------------------------------------
-- RLS: invoice_lines
-- ---------------------------------------------------------------------------
--
-- Visibility is inherited: the subquery on `invoices` is itself subject to the
-- policies above, so "lines of invoices you can see" falls out without
-- restating the three arms. The dependency runs one way only -- no policy on
-- `invoices` references `invoice_lines` -- so there is no recursion risk.

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invoice lines follow invoice visibility"
  ON invoice_lines FOR SELECT
  USING (invoice_id IN (SELECT id FROM invoices));

-- Writes are draft-only and mirror the parent's UPDATE role set. After send
-- the lines are frozen, the same as the money columns on the parent.
CREATE POLICY "Admin/owner/member can insert draft invoice lines"
  ON invoice_lines FOR INSERT
  WITH CHECK (
    invoice_id IN (
      SELECT i.id FROM invoices i
      WHERE i.status = 'draft'
        AND i.brand_id IN (SELECT get_user_brand_ids(i.organization_id))
        AND get_user_role(i.organization_id) IN ('admin', 'owner', 'member')
    )
  );

CREATE POLICY "Admin/owner/member can update draft invoice lines"
  ON invoice_lines FOR UPDATE
  USING (
    invoice_id IN (
      SELECT i.id FROM invoices i
      WHERE i.status = 'draft'
        AND i.brand_id IN (SELECT get_user_brand_ids(i.organization_id))
        AND get_user_role(i.organization_id) IN ('admin', 'owner', 'member')
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT i.id FROM invoices i
      WHERE i.status = 'draft'
        AND i.brand_id IN (SELECT get_user_brand_ids(i.organization_id))
        AND get_user_role(i.organization_id) IN ('admin', 'owner', 'member')
    )
  );

CREATE POLICY "Admin/owner/member can delete draft invoice lines"
  ON invoice_lines FOR DELETE
  USING (
    invoice_id IN (
      SELECT i.id FROM invoices i
      WHERE i.status = 'draft'
        AND i.brand_id IN (SELECT get_user_brand_ids(i.organization_id))
        AND get_user_role(i.organization_id) IN ('admin', 'owner', 'member')
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: invoice_payments
-- ---------------------------------------------------------------------------
--
-- Reads follow the parent, so a rep sees that their order was paid and a buyer
-- sees their own payment history.
--
-- Writes are admin/owner only, one step tighter than the admin/owner/member
-- that may send. This is the money record: recording a payment is an
-- accounting act, and 'member' on this team is an ops role.

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invoice payments follow invoice visibility"
  ON invoice_payments FOR SELECT
  USING (invoice_id IN (SELECT id FROM invoices));

-- A draft has not been issued, so there is nothing to pay against it yet.
CREATE POLICY "Admin/owner can insert invoice payments"
  ON invoice_payments FOR INSERT
  WITH CHECK (
    get_user_role(organization_id) IN ('admin', 'owner')
    AND invoice_id IN (
      SELECT i.id FROM invoices i
      WHERE i.organization_id = invoice_payments.organization_id
        AND i.status <> 'draft'
        AND i.brand_id IN (SELECT get_user_brand_ids(i.organization_id))
    )
  );

CREATE POLICY "Admin/owner can update invoice payments"
  ON invoice_payments FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'))
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete invoice payments"
  ON invoice_payments FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
